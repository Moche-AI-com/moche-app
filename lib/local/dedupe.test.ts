import { describe, expect, it } from 'vitest';
import {
  areSamePlace,
  findDuplicate,
  normalizePlaceAddress,
  normalizePlaceName,
  type PlaceIdentity,
} from './dedupe';

function place(overrides: Partial<PlaceIdentity> = {}): PlaceIdentity {
  return {
    provider: 'osm',
    providerPlaceId: null,
    name: 'Café & Co., LLC',
    normalizedName: 'cafe and',
    category: 'cafe',
    address: '12 Main St.',
    lat: 40,
    lon: -73,
    ...overrides,
  };
}

describe('local place deduplication', () => {
  it('normalizes legal suffixes, ampersands, and punctuation in names', () => {
    expect(normalizePlaceName('Café & Co., LLC')).toBe('caf and');
    expect(normalizePlaceName('Northwind Incorporated')).toBe('northwind');
  });

  it('normalizes addresses consistently', () => {
    expect(normalizePlaceAddress('12 Main St., Apt #4')).toBe('12 main st apt 4');
    expect(normalizePlaceAddress('  ')).toBeNull();
  });

  it('uses provider identity before all fuzzy matching', () => {
    expect(areSamePlace(
      place({ providerPlaceId: 'osm:123', normalizedName: 'a', category: 'park' }),
      place({ providerPlaceId: 'osm:123', normalizedName: 'different', category: 'restaurant', lat: null, lon: null }),
    )).toBe(true);
  });

  it('matches the same normalized name inside 150m but not at its boundary', () => {
    const base = place({ normalizedName: 'river walk', lat: 40, lon: -73 });
    expect(areSamePlace(base, place({ normalizedName: 'river walk', lat: 40.001, lon: -73 }))).toBe(true);
    // About 150m at the equator; explicit distance control is not exposed, so use
    // a latitude delta calibrated just past the strict <150m threshold.
    expect(areSamePlace(
      place({ normalizedName: 'river walk', address: 'A', lat: 0, lon: 0 }),
      place({ normalizedName: 'river walk', address: 'B', lat: 150.01 / 111_194.9266, lon: 0 }),
    )).toBe(false);
  });

  it('matches same-category records at a normalized address or within 50m', () => {
    expect(areSamePlace(
      place({ address: '12 Main St.', lat: null, lon: null }),
      place({ address: '12 MAIN ST', lat: null, lon: null }),
    )).toBe(true);
    expect(areSamePlace(
      place({ normalizedName: 'one', lat: 0, lon: 0 }),
      place({ normalizedName: 'two', lat: 0.0004, lon: 0 }),
    )).toBe(true);
  });

  it('does not fuzzy-match records across categories', () => {
    expect(areSamePlace(
      place({ normalizedName: 'same', category: 'cafe', address: '1 First', lat: 0, lon: 0 }),
      place({ normalizedName: 'different', category: 'restaurant', address: '1 First', lat: 0, lon: 0.0001 }),
    )).toBe(false);
  });

  it('finds the first matching canonical identity', () => {
    const duplicate = place({ providerPlaceId: 'same' });
    expect(findDuplicate(
      place({ providerPlaceId: 'same' }),
      [place({ name: 'other', normalizedName: 'other', category: 'park' }), duplicate],
    )).toBe(duplicate);
    expect(findDuplicate(place({ normalizedName: 'other', category: 'park' }), [duplicate])).toBeNull();
  });
});
