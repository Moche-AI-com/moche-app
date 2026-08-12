import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { hasS3, putObject, getObjectBytes, deleteObject } from '@/lib/storage/s3';
import { assertPublicUrl, isSsrfError } from '@/lib/net/ssrf';
import {
  COVER_SIZES,
  COVER_ERRORS,
  COVER_CACHE_CONTROL,
  MAX_COVER_BYTES,
  DEFAULT_COVER_SIZE,
  coverKey,
  coverPublicUrl,
  coverSize,
  coverVersionFromUrl,
  detectImageType,
  isCoverSizeId,
  isCoverVersion,
  isManagedCoverUrl,
  newCoverVersion,
} from '@/lib/storage/cover-image';
import { buildCoverDerivatives } from '@/lib/storage/cover-resize';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

// Sharp is a native module: this route must stay on the Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Full rationale for this design (S3 over Supabase Storage, versioned proxy
// reads, server-side fetch of pasted URLs) is in
// docs/decisions/cover-image-storage.md.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_FETCH_TIMEOUT_MS = 10_000;

const UrlBodySchema = z.object({ url: z.string().min(1).max(2000) });

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Fetches a host-pasted image URL server-side, size-capped and SSRF-guarded. */
async function fetchRemoteImage(rawUrl: string): Promise<Buffer> {
  const url = await assertPublicUrl(rawUrl); // throws SsrfError
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.5' },
    });
    if (!res.ok) throw new Error(COVER_ERRORS.urlUnreachable);

    // Trust the declared length only as an early reject; the real cap is the
    // byte counter below, since Content-Length can lie or be absent.
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_COVER_BYTES) throw new Error(COVER_ERRORS.tooLarge);

    const reader = res.body?.getReader();
    if (!reader) throw new Error(COVER_ERRORS.urlNotImage);
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_COVER_BYTES) {
        await reader.cancel();
        throw new Error(COVER_ERRORS.tooLarge);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return bad('Not found.', 404);
  if (!hasS3()) return bad('Image storage is not configured yet.', 503);

  const access = await getPropertyAccess(propertyId);
  if (!access) return bad('Not found.', 404);
  if (!access.can.editProperty) return bad('You cannot change this property\u2019s cover image.', 403);

  const ctx = await getSessionContext();
  const admin = createAdminClient();
  const rate = await checkRateLimit(admin, {
    key: ctx?.user.id ?? propertyId,
    limit: 12,
    windowSeconds: 60,
    action: 'property.cover.upload',
  });
  if (!rate.allowed) return bad('Too many uploads in a row. Try again in a minute.', 429);

  // --- Read the source bytes, from either a file part or a pasted URL -------
  let source: Buffer;
  let origin: 'file' | 'url' = 'file';
  let sourceUrl: string | null = null;
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File) || file.size === 0) return bad(COVER_ERRORS.missing);
    if (file.size > MAX_COVER_BYTES) return bad(COVER_ERRORS.tooLarge, 413);
    source = Buffer.from(await file.arrayBuffer());
  } else {
    origin = 'url';
    const json = await req.json().catch(() => null);
    const parsed = UrlBodySchema.safeParse(json);
    if (!parsed.success) return bad(COVER_ERRORS.missing);
    sourceUrl = parsed.data.url.trim();
    try {
      source = await fetchRemoteImage(sourceUrl);
    } catch (e) {
      if (isSsrfError(e)) return bad(e.message);
      const msg = e instanceof Error ? e.message : COVER_ERRORS.urlUnreachable;
      const known = (Object.values(COVER_ERRORS) as string[]).includes(msg);
      log.warn('cover_url_fetch_failed', { propertyId: propertyId, error: msg });
      return bad(known ? msg : COVER_ERRORS.urlUnreachable, 502);
    }
  }

  if (source.length > MAX_COVER_BYTES) return bad(COVER_ERRORS.tooLarge, 413);

  // Format is decided from the bytes, never from the declared MIME type or the
  // filename — both are caller-controlled.
  const sniffed = detectImageType(source);
  if (!sniffed) return bad(origin === 'url' ? COVER_ERRORS.urlNotImage : COVER_ERRORS.badFormat, 415);

  // --- Resize into the fixed derivative ladder -----------------------------
  const version = newCoverVersion(crypto.randomUUID());
  let derivatives: { key: string; body: Buffer }[];
  try {
    derivatives = (await buildCoverDerivatives(source)).map((d) => ({
      key: coverKey(propertyId, version, d.size),
      body: d.body,
    }));
  } catch (e) {
    log.warn('cover_resize_failed', { propertyId: propertyId, error: e instanceof Error ? e.message : 'unknown' });
    return bad(COVER_ERRORS.unreadable, 422);
  }

  // --- Store, then point the property row at the new version ---------------
  try {
    await Promise.all(
      derivatives.map((d) =>
        putObject({ key: d.key, body: d.body, contentType: 'image/jpeg', cacheControl: COVER_CACHE_CONTROL }),
      ),
    );
  } catch (e) {
    log.warn('cover_store_failed', { propertyId: propertyId, error: e instanceof Error ? e.message : 'unknown' });
    return bad('Could not save that image. Please try again.', 502);
  }

  const previousUrl = access.property.cover_image_url ?? null;
  const url = coverPublicUrl(propertyId, version, DEFAULT_COVER_SIZE);
  const { error: updateError } = await admin
    .from('properties')
    .update({ cover_image_url: url, updated_at: new Date().toISOString() })
    .eq('id', propertyId);
  if (updateError) {
    log.warn('cover_update_failed', { propertyId: propertyId, error: updateError.message });
    return bad('Could not save that image. Please try again.', 500);
  }

  // Best-effort cleanup of the previous version's objects. A leftover object is
  // harmless (lifecycle expiry catches it); a failed cleanup must not fail the
  // request the host is waiting on.
  await removeManagedCover(propertyId, previousUrl);

  await audit(admin, {
    action: 'property.cover.updated',
    actorProfileId: ctx?.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: propertyId,
    targetType: 'property',
    targetId: propertyId,
    metadata: { origin, version, sourceType: sniffed, sourceUrl, sizes: COVER_SIZES.map((s) => s.id) },
  });

  return NextResponse.json({
    ok: true,
    url,
    version,
    sizes: COVER_SIZES.map((s) => ({ ...s, url: coverPublicUrl(propertyId, version, s.id) })),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return bad('Not found.', 404);
  const access = await getPropertyAccess(propertyId);
  if (!access) return bad('Not found.', 404);
  if (!access.can.editProperty) return bad('You cannot change this property\u2019s cover image.', 403);

  const admin = createAdminClient();
  const previousUrl = access.property.cover_image_url ?? null;
  const { error } = await admin
    .from('properties')
    .update({ cover_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', propertyId);
  if (error) return bad('Could not remove the cover image. Please try again.', 500);

  await removeManagedCover(propertyId, previousUrl);

  const ctx = await getSessionContext();
  await audit(admin, {
    action: 'property.cover.removed',
    actorProfileId: ctx?.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  return NextResponse.json({ ok: true });
}

/**
 * Public read path. Unauthenticated on purpose: the guest portal is public and
 * this is the image on it. It is not a general bucket reader — it serves only
 * the version currently recorded on the property row, and only the three fixed
 * derivative keys.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  if (!UUID_RE.test(propertyId)) return bad('Not found.', 404);
  if (!hasS3()) return bad('Not found.', 404);

  const { searchParams } = new URL(req.url);
  const version = searchParams.get('v') ?? '';
  const sizeParam = searchParams.get('size') ?? DEFAULT_COVER_SIZE;
  if (!isCoverVersion(version)) return bad('Not found.', 404);
  if (!isCoverSizeId(sizeParam)) return bad('Not found.', 404);

  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('cover_image_url')
    .eq('id', propertyId)
    .maybeSingle();
  if (!property) return bad('Not found.', 404);

  // The requested version must be the live one. Old versions stop resolving the
  // moment a new cover is uploaded, which is also what makes the immutable
  // cache header safe.
  if (coverVersionFromUrl(property.cover_image_url) !== version) return bad('Not found.', 404);

  let object: { body: Buffer; contentType: string } | null;
  try {
    object = await getObjectBytes(coverKey(propertyId, version, sizeParam));
  } catch (e) {
    log.warn('cover_read_failed', { propertyId: propertyId, error: e instanceof Error ? e.message : 'unknown' });
    return bad('Not found.', 404);
  }
  if (!object) return bad('Not found.', 404);

  const size = coverSize(sizeParam);
  // Copy into a plain ArrayBuffer so the body type matches BodyInit exactly
  // (Buffer's backing store is typed as ArrayBufferLike, which BlobPart rejects).
  const bytes = new ArrayBuffer(object.body.byteLength);
  new Uint8Array(bytes).set(object.body);
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(blob.size),
      'cache-control': COVER_CACHE_CONTROL,
      'x-content-type-options': 'nosniff',
      'x-cover-size': `${size.width}x${size.height}`,
    },
  });
}

/** Deletes every derivative of a managed cover URL. Never throws. */
async function removeManagedCover(propertyId: string, url: string | null): Promise<void> {
  if (!isManagedCoverUrl(url, propertyId)) return;
  const version = coverVersionFromUrl(url);
  if (!isCoverVersion(version)) return;
  await Promise.all(
    COVER_SIZES.map(async (size) => {
      try {
        await deleteObject(coverKey(propertyId, version, size.id));
      } catch {
        // Intentionally swallowed: see call site.
      }
    }),
  );
}
