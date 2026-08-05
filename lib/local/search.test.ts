import { describe, it, expect } from 'vitest';
import type { MergedLocalPlace } from './merge';
import {
  LOCAL_SEARCH_MIN_RESULTS,
  isSearchableQuery,
  mergeRemoteResults,
  needsRemoteFallback,
  normalizeQuery,
  scoreLocalMatch,
  searchLocalPlaces,
  sourceLabel,
  providerCategoryToLocal,
  tokenize,
  type RemoteCandidate,
} from './search';

function place(over: Partial<MergedLocalPlace> = {}): MergedLocalPlace {
  return {
    id: over.id ?? 'id-1',
    name: 'name' in over ? (over.name ?? null) : 'Blue Bottle Coffee',
    category: over.category ?? 'cafe',
    host_notes: over.host_notes ?? null,
    host_starred: over.host_starred ?? false,
    rating: over.rating ?? null,
    distance_m: over.distance_m ?? null,
    source: over.source ?? 'discovered',
    detail: over.detail ?? null,
    distanceNote: over.distanceNote ?? null,
    priority: over.priority ?? 0,
  };
}

describe('query helpers', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeQuery('  Blue   BOTTLE ')).toBe('blue bottle');
  });

  it('tokenizes on punctuation', () => {
    expect(tokenize("Joe's Pizza & Bar")).toEqual(['joe', 's', 'pizza', 'bar']);
  });

  it('rejects a one-character query', () => {
    expect(isSearchableQuery('a')).toBe(false);
    expect(isSearchableQuery(' a ')).toBe(false);
    expect(isSearchableQuery('ab')).toBe(true);
  });
});

describe('scoreLocalMatch', () => {
  it('ranks exact name above prefix above substring', () => {
    const exact = scoreLocalMatch('blue bottle coffee', { name: 'Blue Bottle Coffee', category: 'cafe' });
    const prefix = scoreLocalMatch('blue', { name: 'Blue Bottle Coffee', category: 'cafe' });
    const infix = scoreLocalMatch('bottle', { name: 'Blue Bottle Coffee', category: 'cafe' });
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(infix);
  });

  it('matches on all tokens out of order', () => {
    expect(scoreLocalMatch('coffee blue', { name: 'Blue Bottle Coffee', category: 'cafe' })).toBeGreaterThan(0);
  });

  it('matches a category name', () => {
    expect(scoreLocalMatch('pharmacy', { name: 'Ridge Drug', category: 'pharmacy' })).toBeGreaterThan(0);
  });

  it('matches text in the host description and notes', () => {
    expect(scoreLocalMatch('rooftop', { name: 'Ridge Drug', category: 'pharmacy', detail: 'Great rooftop view' })).toBeGreaterThan(0);
    expect(scoreLocalMatch('valet', { name: 'Ridge Drug', category: 'pharmacy', hostNotes: 'Valet only' })).toBeGreaterThan(0);
  });

  it('returns 0 for no match rather than a weak score', () => {
    expect(scoreLocalMatch('kayak', { name: 'Ridge Drug', category: 'pharmacy' })).toBe(0);
  });

  it('returns 0 for a query below the minimum length', () => {
    expect(scoreLocalMatch('r', { name: 'Ridge Drug', category: 'pharmacy' })).toBe(0);
  });

  it('nudges a favorite without letting it beat an exact name hit', () => {
    const fav = scoreLocalMatch('cafe', { name: 'Whatever', category: 'cafe', favorite: true });
    const exact = scoreLocalMatch('whatever', { name: 'Whatever', category: 'cafe' });
    expect(fav).toBeGreaterThan(scoreLocalMatch('cafe', { name: 'Whatever', category: 'cafe' }));
    expect(exact).toBeGreaterThan(fav);
  });
});

describe('searchLocalPlaces', () => {
  const places = [
    place({ id: 'a', name: 'Blue Bottle Coffee', source: 'discovered', distance_m: 900 }),
    place({ id: 'b', name: 'Blue Bottle', source: 'curated', detail: 'Our favorite espresso' }),
    place({ id: 'c', name: 'Ridge Pharmacy', category: 'pharmacy' }),
  ];

  it('returns only relevant rows', () => {
    const hits = searchLocalPlaces('blue', places);
    expect(hits.map((h) => h.id).sort()).toEqual(['a', 'b']);
  });

  it('labels every row with its source and marks it as already in the library', () => {
    for (const hit of searchLocalPlaces('blue', places)) {
      expect(['Your pick', 'Discovered']).toContain(hit.sourceLabel);
      expect(hit.inLibrary).toBe(true);
    }
  });

  it('puts the curated row first when relevance ties', () => {
    const hits = searchLocalPlaces('blue bottle', places);
    expect(hits[0].id).toBe('b');
    expect(hits[0].source).toBe('curated');
  });

  it('returns nothing for a too-short query instead of everything', () => {
    expect(searchLocalPlaces('b', places)).toEqual([]);
    expect(searchLocalPlaces('', places)).toEqual([]);
  });

  it('honors the limit', () => {
    expect(searchLocalPlaces('blue', places, 1)).toHaveLength(1);
  });

  it('never returns a null name', () => {
    const hits = searchLocalPlaces('pharmacy', [place({ id: 'z', name: null, category: 'pharmacy' })]);
    expect(hits[0].name).toBe('Unnamed place');
  });
});

describe('needsRemoteFallback', () => {
  it('is the documented threshold: fewer than three local matches', () => {
    expect(LOCAL_SEARCH_MIN_RESULTS).toBe(3);
    expect(needsRemoteFallback(0)).toBe(true);
    expect(needsRemoteFallback(2)).toBe(true);
    expect(needsRemoteFallback(3)).toBe(false);
    expect(needsRemoteFallback(9)).toBe(false);
  });
});

describe('mergeRemoteResults', () => {
  const local = searchLocalPlaces('blue', [
    place({ id: 'a', name: 'Blue Bottle Coffee', source: 'curated' }),
  ]);
  const remote: RemoteCandidate[] = [
    { key: 'm1', name: 'Blue Bottle Coffee', category: 'cafe', address: '1 Main St', distanceMeters: 400 },
    { key: 'm2', name: 'Bluebird Cafe', category: 'cafe', address: '2 Main St', distanceMeters: 800 },
  ];

  it('drops a provider row that duplicates a local row by name', () => {
    const merged = mergeRemoteResults('blue', local, remote);
    expect(merged.filter((r) => r.name === 'Blue Bottle Coffee')).toHaveLength(1);
    expect(merged.find((r) => r.name === 'Blue Bottle Coffee')!.source).toBe('curated');
  });

  it('labels provider rows distinctly and marks them as not in the library', () => {
    const added = mergeRemoteResults('blue', local, remote).find((r) => r.name === 'Bluebird Cafe')!;
    expect(added.source).toBe('mapbox');
    expect(added.sourceLabel).toBe('Map suggestion');
    expect(added.inLibrary).toBe(false);
    expect(added.id.startsWith('mapbox:')).toBe(true);
    expect(added.address).toBe('2 Main St');
  });

  it('keeps local rows ahead of provider rows at equal relevance', () => {
    const merged = mergeRemoteResults('cafe', searchLocalPlaces('cafe', [
      place({ id: 'a', name: 'Somewhere', category: 'cafe', source: 'discovered' }),
    ]), [{ key: 'm3', name: 'Elsewhere', category: 'cafe', address: null, distanceMeters: 10 }]);
    expect(merged[0].inLibrary).toBe(true);
  });

  it('never drops a loosely matching provider row to score 0', () => {
    const merged = mergeRemoteResults('zzz', [], [
      { key: 'm4', name: 'Totally Unrelated', category: 'bar', address: null, distanceMeters: null },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBeGreaterThan(0);
  });

  it('skips a blank provider name', () => {
    expect(mergeRemoteResults('x', [], [{ key: 'm5', name: '   ', category: 'bar', address: null, distanceMeters: null }])).toEqual([]);
  });

  it('honors the combined limit', () => {
    expect(mergeRemoteResults('blue', local, remote, 1)).toHaveLength(1);
  });
});

describe('sourceLabel', () => {
  it('never leaks provider jargon for our own rows', () => {
    expect(sourceLabel('curated')).toBe('Your pick');
    expect(sourceLabel('discovered')).toBe('Discovered');
    expect(sourceLabel('mapbox')).toBe('Map suggestion');
  });
});

describe('providerCategoryToLocal', () => {
  it('maps provider ids onto our own category keys', () => {
    expect(providerCategoryToLocal('coffee_shop')).toBe('cafe');
    expect(providerCategoryToLocal('Coffee Shop')).toBe('cafe');
    expect(providerCategoryToLocal('museum')).toBe('tourist_attraction');
    expect(providerCategoryToLocal('golf_course')).toBe('golf_course');
  });

  it('falls back rather than dropping an unmodelled category', () => {
    expect(providerCategoryToLocal('surf_school')).toBe('tourist_attraction');
    expect(providerCategoryToLocal(null)).toBe('tourist_attraction');
    expect(providerCategoryToLocal('')).toBe('tourist_attraction');
  });
});
