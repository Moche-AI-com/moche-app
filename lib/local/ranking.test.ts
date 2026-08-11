import { describe, expect, it } from 'vitest';
import { comparePlacesForGuest, rankPlacesForGuest, type RankedPlace } from './ranking';

function place(overrides: Partial<RankedPlace> = {}): RankedPlace {
  return {
    recommendationId: 'a',
    status: 'approved',
    intentTags: [],
    hostNote: null,
    tags: [],
    isFavorite: false,
    distanceMiles: 2,
    lastRefreshedAt: '2026-01-01T00:00:00Z',
    name: 'Alpha',
    ...overrides,
  };
}

describe('canonical guest ranking', () => {
  it('excludes hidden places and orders status before other signals', () => {
    const ranked = rankPlacesForGuest([
      place({ recommendationId: 'hidden', status: 'hidden' }),
      place({ recommendationId: 'suggested', status: 'suggested', isFavorite: true }),
      place({ recommendationId: 'approved', status: 'approved' }),
    ]);
    expect(ranked.map((row) => row.recommendationId)).toEqual(['approved', 'suggested']);
  });

  it('prioritizes matching intent tags, then host context and favorites', () => {
    const ranked = rankPlacesForGuest([
      place({ recommendationId: 'favorite', isFavorite: true }),
      place({ recommendationId: 'context', hostNote: 'Ask for the patio' }),
      place({ recommendationId: 'intent', intentTags: ['dinner'] }),
    ], ['dinner']);
    expect(ranked.map((row) => row.recommendationId)).toEqual(['intent', 'context', 'favorite']);
  });

  it('sorts distance with nulls last and newer records before older records', () => {
    const ranked = rankPlacesForGuest([
      place({ recommendationId: 'unknown', distanceMiles: null }),
      place({ recommendationId: 'far', distanceMiles: 3 }),
      place({ recommendationId: 'near-old', distanceMiles: 1, lastRefreshedAt: '2025-01-01T00:00:00Z' }),
      place({ recommendationId: 'near-new', distanceMiles: 1, lastRefreshedAt: '2026-02-01T00:00:00Z' }),
    ]);
    expect(ranked.map((row) => row.recommendationId)).toEqual(['near-new', 'near-old', 'far', 'unknown']);
  });

  it('uses name and canonical id as stable final tie-breaks independent of input order', () => {
    const rows = [
      place({ recommendationId: '2', name: 'Bravo', distanceMiles: 1 }),
      place({ recommendationId: '1', name: 'Alpha', distanceMiles: 1 }),
      place({ recommendationId: '3', name: 'Alpha', distanceMiles: 1 }),
    ];
    const expected = ['1', '3', '2'];
    expect(rankPlacesForGuest(rows).map((row) => row.recommendationId)).toEqual(expected);
    expect(rankPlacesForGuest([...rows].reverse()).map((row) => row.recommendationId)).toEqual(expected);
    expect(comparePlacesForGuest(rows[1], rows[2])).toBeLessThan(0);
  });
});
