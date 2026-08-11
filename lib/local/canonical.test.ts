import { describe, expect, it } from 'vitest';
import { mapAndRankCanonicalPlaces, mapCanonicalPlaceRow, type CanonicalPlaceRow } from './canonical';

function row(overrides: Partial<CanonicalPlaceRow> = {}): CanonicalPlaceRow {
  return {
    id: 'rec-a',
    status: 'approved',
    host_note: null,
    tags: [],
    intent_tags: [],
    is_favorite: false,
    distance_miles: 2,
    places: {
      name: 'Alpha',
      category: 'cafe',
      address: '1 Main St',
      provider: 'osm',
      last_refreshed_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('canonical local places', () => {
  it('maps a joined canonical row into the LocalPlaceRow contract', () => {
    expect(mapCanonicalPlaceRow(row({
      host_note: 'Order ahead',
      tags: ['coffee'],
      intent_tags: ['breakfast'],
      is_favorite: true,
      distance_miles: 0.4,
    }))).toEqual({
      recommendationId: 'rec-a',
      name: 'Alpha',
      category: 'cafe',
      address: '1 Main St',
      status: 'approved',
      hostNote: 'Order ahead',
      tags: ['coffee'],
      intentTags: ['breakfast'],
      isFavorite: true,
      distanceMiles: 0.4,
      lastRefreshedAt: '2026-01-01T00:00:00Z',
      provider: 'osm',
    });
  });

  it('uses the shared guest ranking when mapping canonical rows', () => {
    const ranked = mapAndRankCanonicalPlaces([
      row({ id: 'suggested', status: 'suggested', is_favorite: true, places: { ...row().places!, name: 'Suggested' } }),
      row({ id: 'hidden', status: 'hidden', places: { ...row().places!, name: 'Hidden' } }),
      row({ id: 'approved', status: 'approved', places: { ...row().places!, name: 'Approved' } }),
    ]);
    expect(ranked.map((place) => place.recommendationId)).toEqual(['approved', 'suggested']);
  });
});
