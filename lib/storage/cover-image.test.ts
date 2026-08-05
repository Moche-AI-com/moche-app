import { describe, it, expect } from 'vitest';
import {
  COVER_SIZES,
  MAX_COVER_BYTES,
  ALLOWED_COVER_TYPES,
  COVER_ERRORS,
  isCoverSizeId,
  coverSize,
  isAllowedCoverType,
  isCoverVersion,
  newCoverVersion,
  coverKey,
  coverPublicUrl,
  isManagedCoverUrl,
  coverVersionFromUrl,
  detectImageType,
} from './cover-image';

const PROP = '11111111-2222-3333-4444-555555555555';
const VER = 'abcdef0123456789abcdef0123456789';

describe('cover size ladder', () => {
  it('has exactly three 16:9 derivatives', () => {
    expect(COVER_SIZES).toHaveLength(3);
    for (const s of COVER_SIZES) {
      expect(s.width / s.height).toBeCloseTo(16 / 9, 5);
    }
  });

  it('is ordered largest to smallest', () => {
    const widths = COVER_SIZES.map((s) => s.width);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
  });

  it('validates size ids', () => {
    expect(isCoverSizeId('hero')).toBe(true);
    expect(isCoverSizeId('card')).toBe(true);
    expect(isCoverSizeId('thumb')).toBe(true);
    expect(isCoverSizeId('original')).toBe(false);
    expect(isCoverSizeId(null)).toBe(false);
    expect(isCoverSizeId('../../etc/passwd')).toBe(false);
  });

  it('looks up dimensions', () => {
    expect(coverSize('hero')).toEqual({ id: 'hero', width: 1600, height: 900 });
    // @ts-expect-error deliberate bad input
    expect(() => coverSize('nope')).toThrow();
  });
});

describe('limits and formats', () => {
  it('caps the source image at 2 MB', () => {
    expect(MAX_COVER_BYTES).toBe(2 * 1024 * 1024);
  });

  it('allows only jpeg, png and webp', () => {
    expect([...ALLOWED_COVER_TYPES]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(isAllowedCoverType('image/jpeg')).toBe(true);
    expect(isAllowedCoverType('image/gif')).toBe(false);
    expect(isAllowedCoverType('image/svg+xml')).toBe(false);
    expect(isAllowedCoverType(undefined)).toBe(false);
  });

  it('gives a distinct message per failure reason', () => {
    const messages = Object.values(COVER_ERRORS);
    expect(new Set(messages).size).toBe(messages.length);
    expect(COVER_ERRORS.tooLarge).not.toBe(COVER_ERRORS.badFormat);
    expect(COVER_ERRORS.urlUnreachable).not.toBe(COVER_ERRORS.urlNotImage);
  });
});

describe('version tokens', () => {
  it('accepts 32 lowercase hex chars only', () => {
    expect(isCoverVersion(VER)).toBe(true);
    expect(isCoverVersion(VER.toUpperCase())).toBe(false);
    expect(isCoverVersion(VER.slice(0, 31))).toBe(false);
    expect(isCoverVersion(`${VER}0`)).toBe(false);
    expect(isCoverVersion('../../secret')).toBe(false);
    expect(isCoverVersion(42)).toBe(false);
  });

  it('derives a version from a uuid', () => {
    expect(newCoverVersion('ABCDEF01-2345-6789-ABCD-EF0123456789')).toBe(VER);
    expect(() => newCoverVersion('not-a-uuid')).toThrow();
  });
});

describe('keys and urls', () => {
  it('scopes every key under the property id', () => {
    expect(coverKey(PROP, VER, 'hero')).toBe(`properties/${PROP}/covers/${VER}/hero.jpg`);
    expect(coverKey(PROP, VER, 'thumb')).toBe(`properties/${PROP}/covers/${VER}/thumb.jpg`);
  });

  it('refuses to build a key from an untrusted version or size', () => {
    expect(() => coverKey(PROP, '../..', 'hero')).toThrow();
    // @ts-expect-error deliberate bad input
    expect(() => coverKey(PROP, VER, '../../x')).toThrow();
  });

  it('builds an app-relative public url carrying the version', () => {
    expect(coverPublicUrl(PROP, VER)).toBe(`/api/properties/${PROP}/cover?v=${VER}&size=hero`);
    expect(coverPublicUrl(PROP, VER, 'card')).toContain('size=card');
    expect(() => coverPublicUrl(PROP, 'bad')).toThrow();
  });

  it('recognises its own managed urls', () => {
    const url = coverPublicUrl(PROP, VER);
    expect(isManagedCoverUrl(url)).toBe(true);
    expect(isManagedCoverUrl(url, PROP)).toBe(true);
    expect(isManagedCoverUrl(url, '99999999-2222-3333-4444-555555555555')).toBe(false);
    expect(isManagedCoverUrl('https://images.example.com/a.jpg')).toBe(false);
    expect(isManagedCoverUrl(null)).toBe(false);
    expect(isManagedCoverUrl('')).toBe(false);
  });

  it('extracts the version from a managed url', () => {
    expect(coverVersionFromUrl(coverPublicUrl(PROP, VER, 'thumb'))).toBe(VER);
    expect(coverVersionFromUrl('https://example.com/a.jpg')).toBe('');
    expect(coverVersionFromUrl(null)).toBe('');
  });
});

describe('detectImageType', () => {
  const pad = (head: number[]) => {
    const b = new Uint8Array(16);
    head.forEach((v, i) => (b[i] = v));
    return b;
  };

  it('sniffs jpeg', () => {
    expect(detectImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('sniffs png', () => {
    expect(detectImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
  });

  it('sniffs webp', () => {
    const b = pad([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00]);
    b[8] = 0x57; b[9] = 0x45; b[10] = 0x42; b[11] = 0x50;
    expect(detectImageType(b)).toBe('image/webp');
  });

  it('rejects gif, svg and truncated input', () => {
    expect(detectImageType(pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull(); // GIF89a
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="http://x">'))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });

  it('does not trust a RIFF container that is not WEBP', () => {
    const b = pad([0x52, 0x49, 0x46, 0x46]);
    b[8] = 0x41; b[9] = 0x56; b[10] = 0x49; b[11] = 0x20; // "AVI "
    expect(detectImageType(b)).toBeNull();
  });
});
