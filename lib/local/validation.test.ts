import { describe, expect, it } from 'vitest';
import { localPlaceSchema, safeWebsite, safePhone, validCoordinates } from './validation';

const place = { name: 'Café Azul', category: 'cafe', address: '1 Main St', hostNote: 'Try breakfast' };

describe('local place input boundaries', () => {
  it('preserves host-entered Unicode names and normalizes optional fields', () => {
    expect(localPlaceSchema.parse(place)).toMatchObject({ name: 'Café Azul', lat: null, lng: null, website: null });
  });
  it.each([
    { name: ' ' }, { name: 'a'.repeat(161) }, { hostNote: 'a'.repeat(501) },
    { lat: '91', lng: '0' }, { lat: '0', lng: '' }, { lat: 'NaN', lng: '0' },
    { website: 'javascript:alert(1)' }, { website: 'https://user:pass@example.com' },
    { status: 'published' }, { tags: 'a'.repeat(41) },
  ])('rejects invalid data instead of silently truncating it: %j', (override) => {
    expect(localPlaceSchema.safeParse({ ...place, ...override }).success).toBe(false);
  });
  it('accepts zero coordinates and clearable optional details', () => {
    expect(localPlaceSchema.parse({ ...place, lat: '0', lng: '0', website: '' })).toMatchObject({ lat: 0, lng: 0, website: null });
  });
  it('requires a usable location before publishing, but allows name-only drafts', () => {
    const nameOnly = { name: 'Hidden gem', category: 'cafe', address: '' };
    const result = localPlaceSchema.safeParse(nameOnly);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('Add an address or map pin before sharing with guests.');
    expect(localPlaceSchema.safeParse({ ...nameOnly, status: 'suggested' }).success).toBe(true);
    expect(localPlaceSchema.safeParse({ ...nameOnly, status: 'hidden' }).success).toBe(true);
    expect(localPlaceSchema.safeParse({ ...nameOnly, lat: '0', lng: '0' }).success).toBe(true);
  });
  it('normalizes and bounds tags', () => {
    expect(localPlaceSchema.parse({ ...place, tags: 'Family, family, Rainy-day' }).tags).toEqual(['family', 'rainy-day']);
    expect(localPlaceSchema.safeParse({ ...place, tags: Array.from({ length: 13 }, (_, i) => `tag${i}`).join(',') }).success).toBe(false);
  });
  it('rejects provider payloads on the manual save boundary', () => {
    expect(localPlaceSchema.safeParse({ ...place, provider: 'mapbox' }).success).toBe(false);
  });
  it('sanitizes legacy outbound data', () => {
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
    expect(safeWebsite('https://example.com')).toBe('https://example.com/');
    expect(safePhone('+1 (212) 555-0100')).toBe('tel:+12125550100');
    expect(safePhone('+++123')).toBeNull();
    expect(validCoordinates(Infinity, 0)).toBe(false);
  });
});
