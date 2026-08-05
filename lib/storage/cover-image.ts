// ============================================================================
// Cover image contract (backlog P4-03/P4-04/P4-05).
//
// Storage backend: S3 (see docs/decisions/cover-image-storage.md). The bucket is
// private, so the browser never talks to S3 for covers. Instead:
//
//   1. Host uploads a file (or pastes an image URL) to
//      POST /api/properties/:id/cover
//   2. The route validates + resizes with Sharp into three fixed derivatives and
//      PUTs them to S3 under a per-upload version prefix.
//   3. properties.cover_image_url is set to an app-relative URL that carries the
//      version, e.g. /api/properties/:id/cover?v=<version>&size=hero
//   4. GET on that route streams the object back with an immutable cache header.
//      Because the version is part of the URL and must match the version stored
//      on the property row, the route cannot be used to read arbitrary keys.
//
// External https URLs pasted by hosts are fetched server-side and stored — never
// hotlinked — so a guest portal never issues a request to a third-party host.
//
// This module is pure (no S3, no Sharp, no env) so all of it is unit-testable.
// ============================================================================

export type CoverSizeId = 'hero' | 'card' | 'thumb';

export interface CoverSize {
  id: CoverSizeId;
  width: number;
  height: number;
}

/** Fixed derivative ladder. 16:9 throughout — the portal hero is a wide banner. */
export const COVER_SIZES: readonly CoverSize[] = [
  { id: 'hero', width: 1600, height: 900 },
  { id: 'card', width: 800, height: 450 },
  { id: 'thumb', width: 400, height: 225 },
] as const;

export const DEFAULT_COVER_SIZE: CoverSizeId = 'hero';

export function isCoverSizeId(value: unknown): value is CoverSizeId {
  return typeof value === 'string' && COVER_SIZES.some((s) => s.id === value);
}

export function coverSize(id: CoverSizeId): CoverSize {
  const found = COVER_SIZES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown cover size: ${id}`);
  return found;
}

/** Hard ceiling on the source image the host gives us. */
export const MAX_COVER_BYTES = 2 * 1024 * 1024; // 2 MB

export const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedCoverType = (typeof ALLOWED_COVER_TYPES)[number];

export function isAllowedCoverType(value: unknown): value is AllowedCoverType {
  return typeof value === 'string' && (ALLOWED_COVER_TYPES as readonly string[]).includes(value);
}

/**
 * Distinct, host-readable messages for each rejection reason. The acceptance
 * criterion for P4-05 is that oversized / wrong-format / unreachable-URL each
 * produce a *different* message, so they live in one place and are asserted on.
 */
export const COVER_ERRORS = {
  tooLarge: `That image is larger than 2 MB. Please pick a smaller file or a lower-resolution version.`,
  badFormat: 'Cover images must be a JPEG, PNG, or WebP file.',
  unreadable: 'That file could not be read as an image. Try re-saving it as a JPEG and uploading again.',
  urlNotImage: 'That link did not return an image. Paste a direct link to a photo, not to a web page.',
  urlUnreachable: 'That image link could not be reached. Check the link and try again.',
  missing: 'Choose a file or paste an image link first.',
} as const;

/** Version token: 32 lowercase hex chars (a UUID with dashes stripped). */
const VERSION_RE = /^[0-9a-f]{32}$/;

export function isCoverVersion(value: unknown): value is string {
  return typeof value === 'string' && VERSION_RE.test(value);
}

export function newCoverVersion(uuid: string): string {
  const v = uuid.replace(/-/g, '').toLowerCase();
  if (!isCoverVersion(v)) throw new Error('Invalid uuid for cover version');
  return v;
}

/** S3 object key. Always derived here, never from caller input. */
export function coverKey(propertyId: string, version: string, size: CoverSizeId): string {
  if (!isCoverVersion(version)) throw new Error('Invalid cover version');
  if (!isCoverSizeId(size)) throw new Error('Invalid cover size');
  return `properties/${propertyId}/covers/${version}/${size}.jpg`;
}

/** The value stored in properties.cover_image_url for a managed upload. */
export function coverPublicUrl(propertyId: string, version: string, size: CoverSizeId = DEFAULT_COVER_SIZE): string {
  if (!isCoverVersion(version)) throw new Error('Invalid cover version');
  return `/api/properties/${propertyId}/cover?v=${version}&size=${size}`;
}

/**
 * True when a stored cover_image_url points at our own managed pipeline rather
 * than an arbitrary external URL left over from before this pipeline existed.
 */
export function isManagedCoverUrl(url: string | null | undefined, propertyId?: string): boolean {
  if (!url) return false;
  const m = url.match(/^\/api\/properties\/([0-9a-fA-F-]{36})\/cover\?/);
  if (!m) return false;
  if (propertyId && m[1].toLowerCase() !== propertyId.toLowerCase()) return false;
  return isCoverVersion(coverVersionFromUrl(url));
}

/** Extracts the version token from a managed cover URL, or '' if absent. */
export function coverVersionFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  const m = url.match(/[?&]v=([0-9a-f]{32})\b/);
  return m ? m[1] : '';
}

/**
 * Content-type sniff from magic bytes. The browser-declared MIME type and the
 * file extension are both attacker-controlled, so the stored/processed type is
 * decided from the bytes themselves.
 */
export function detectImageType(bytes: Uint8Array): AllowedCoverType | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/** Cache header for a derivative. Immutable: the version is in the URL. */
export const COVER_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** JPEG quality for derivatives. 82 is visually clean at hero size and small. */
export const COVER_JPEG_QUALITY = 82;
