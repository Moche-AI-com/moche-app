import { describe, it, expect } from 'vitest';
import {
  compareLocalPlaces,
  isGuestVisibleCuratedRec,
  localCategoryLabel,
  localDedupeKey,
  mergeLocalPlaces,
  normalizeLocalCategory,
  SAME_PLACE_RADIUS_M,
  type CuratedRecInput,
  type DiscoveredPlaceInput,
  type MergedLocalPlace,
} from './merge';

function rec(over: Partial<CuratedRecInput> = {}): CuratedRecInput {
  return {
    id: 'rec-1',
    name: 'Blue Bottle Coffee',
    category: 'cafe',
    host_preference: 'neutral',
    approved: true,
    hidden: false,
    host_note: null,
    description: null,
    distance_note: null,
    priority_weight: 0,
    ...over,
  };
}

function place(over: Partial<DiscoveredPlaceInput> = {}): DiscoveredPlaceInput {
  return {
    id: 'np-1',
    name: 'Blue Bottle',
    category: 'cafe',
    host_notes: null,
    host_starred: false,
    hidden: false,
    rating: 4.5,
    distance_m: 800,
    ...over,
  };
}

describe('normalizeLocalCategory', () => {
  // recommendations.category is free text and had already drifted from the
  // canonical nearby keys before the merge existed: production rows use
  // "attraction" where nearby_places uses "tourist_attraction".
  it('maps the real observed divergence', () => {
    expect(normalizeLocalCategory('attraction')).toBe('tourist_attraction');
  });

  it('normalizes case, spacing, and hyphens', () => {
    expect(normalizeLocalCategory('Gas Station')).toBe('gas_station');
    expect(normalizeLocalCategory('golf-course')).toBe('golf_course');
  });

  it('passes an unknown category through instead of dropping the row', () => {
    expect(normalizeLocalCategory('brewery')).toBe('brewery');
  });

  it('falls back for a null category rather than producing an empty key', () => {
    expect(normalizeLocalCategory(null)).toBe('tourist_attraction');
    expect(normalizeLocalCategory('')).toBe('tourist_attraction');
  });
});

describe('localCategoryLabel', () => {
  it('uses the canonical label when there is one', () => {
    expect(localCategoryLabel('tourist_attraction')).toBe('Attraction');
  });

  it('humanizes an unknown key instead of showing a snake_case token', () => {
    expect(localCategoryLabel('wine_bar')).toBe('wine bar');
  });
});

describe('localDedupeKey', () => {
  it('collapses the same place written two different ways', () => {
    expect(localDedupeKey('Blue Bottle Coffee', 'cafe')).toBe(localDedupeKey('blue bottle', 'cafe'));
  });

  it('ignores punctuation and ampersand spelling', () => {
    expect(localDedupeKey("Joe & Sons", 'restaurant')).toBe(localDedupeKey('Joe and Sons!', 'restaurant'));
  });

  it('does NOT collapse the same name in different categories', () => {
    expect(localDedupeKey('Lincoln', 'park')).not.toBe(localDedupeKey('Lincoln', 'restaurant'));
  });

  it('tolerates a null name', () => {
    expect(localDedupeKey(null, 'park')).toBe('park:');
  });
});

describe('isGuestVisibleCuratedRec', () => {
  it('requires approval, because approval is the publish gate', () => {
    expect(isGuestVisibleCuratedRec(rec({ approved: false }))).toBe(false);
    expect(isGuestVisibleCuratedRec(rec({ approved: true }))).toBe(true);
  });

  it('respects hidden', () => {
    expect(isGuestVisibleCuratedRec(rec({ hidden: true }))).toBe(false);
  });

  it('excludes disliked even when approved', () => {
    expect(isGuestVisibleCuratedRec(rec({ host_preference: 'disliked', approved: true }))).toBe(false);
  });
});

describe('mergeLocalPlaces', () => {
  it('includes curated approved rows, which the concierge previously never saw', () => {
    const out = mergeLocalPlaces([rec({ id: 'r1', name: 'Tartine' })], []);
    expect(out.map((p) => p.id)).toEqual(['r1']);
    expect(out[0].source).toBe('curated');
  });

  it('drops unapproved and hidden curated rows', () => {
    const out = mergeLocalPlaces(
      [rec({ id: 'r1', approved: false }), rec({ id: 'r2', name: 'Other', hidden: true })],
      [],
    );
    expect(out).toEqual([]);
  });

  it('drops hidden discovered rows', () => {
    expect(mergeLocalPlaces([], [place({ hidden: true })])).toEqual([]);
  });

  it('collapses a place present in both sources into one entry, curated winning', () => {
    const out = mergeLocalPlaces([rec({ id: 'r1', description: 'Best flat white in town.' })], [place({ id: 'np-1' })]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r1');
    expect(out[0].source).toBe('curated');
    expect(out[0].detail).toBe('Best flat white in town.');
  });

  it('absorbs distance and rating from the discovered twin so nothing measurable is lost', () => {
    const out = mergeLocalPlaces([rec({ id: 'r1' })], [place({ rating: 4.7, distance_m: 640 })]);
    expect(out[0].id).toBe('r1');
    expect(out[0].distance_m).toBe(640);
    expect(out[0].rating).toBe(4.7);
  });

  it('lets a star on either record mark the merged place as a favorite', () => {
    const out = mergeLocalPlaces([rec({ id: 'r1', host_preference: 'neutral' })], [place({ host_starred: true })]);
    expect(out[0].host_starred).toBe(true);
  });

  it('keeps the curated host note and does not let a discovered note overwrite it', () => {
    const out = mergeLocalPlaces(
      [rec({ id: 'r1', host_note: 'Ask for Maria.' })],
      [place({ host_notes: 'auto note' })],
    );
    expect(out[0].host_notes).toBe('Ask for Maria.');
  });

  it('backfills a host note from the discovered twin when the curated row has none', () => {
    const out = mergeLocalPlaces([rec({ id: 'r1', host_note: null })], [place({ host_notes: 'Great patio.' })]);
    expect(out[0].host_notes).toBe('Great patio.');
  });

  it('unifies across the attraction / tourist_attraction category drift', () => {
    const out = mergeLocalPlaces(
      [rec({ id: 'r1', name: 'Pike Place Market', category: 'attraction' })],
      [place({ id: 'np-9', name: 'Pike Place Market', category: 'tourist_attraction' })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe('tourist_attraction');
  });

  it('keeps genuinely different places separate', () => {
    const out = mergeLocalPlaces(
      [rec({ id: 'r1', name: 'Tartine', category: 'cafe' })],
      [place({ id: 'np-1', name: 'Sightglass', category: 'cafe' })],
    );
    expect(out).toHaveLength(2);
  });

  it('returns an empty list when both sources are empty', () => {
    expect(mergeLocalPlaces([], [])).toEqual([]);
  });
});

describe('mergeLocalPlaces chain-branch guard', () => {
  // A name match alone must not collapse two places. Two real branches of the
  // same chain are two places a guest may want; dropping one would be data loss
  // introduced by the dedupe itself.
  it('keeps two branches of a chain that are far apart', () => {
    const out = mergeLocalPlaces([], [
      place({ id: 'near', name: 'Starbucks', distance_m: 400 }),
      place({ id: 'far', name: 'Starbucks', distance_m: 3200 }),
    ]);
    expect(out.map((p) => p.id).sort()).toEqual(['far', 'near']);
  });

  // Both real duplicate pairs in production sit 3m and 30m apart: the same
  // venue indexed twice by the provider.
  it('collapses the same venue indexed twice a few metres apart', () => {
    const out = mergeLocalPlaces([], [
      place({ id: 'a', name: 'Pinchers', category: 'restaurant', distance_m: 778 }),
      place({ id: 'b', name: 'Pinchers', category: 'restaurant', distance_m: 781 }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('collapses rows exactly at the radius and splits rows just beyond it', () => {
    const at = mergeLocalPlaces([], [
      place({ id: 'a', distance_m: 1000 }),
      place({ id: 'b', distance_m: 1000 + SAME_PLACE_RADIUS_M }),
    ]);
    expect(at).toHaveLength(1);

    const beyond = mergeLocalPlaces([], [
      place({ id: 'a', distance_m: 1000 }),
      place({ id: 'b', distance_m: 1000 + SAME_PLACE_RADIUS_M + 1 }),
    ]);
    expect(beyond).toHaveLength(2);
  });

  it('attaches a curated pick to the NEAREST branch regardless of input order', () => {
    const far = place({ id: 'far', name: 'Blue Bottle', distance_m: 4000 });
    const near = place({ id: 'near', name: 'Blue Bottle', distance_m: 500 });
    for (const discovered of [[far, near], [near, far]]) {
      const out = mergeLocalPlaces([rec({ id: 'r1' })], discovered);
      const curatedRow = out.find((p) => p.source === 'curated');
      expect(curatedRow?.distance_m).toBe(500);
      expect(out).toHaveLength(2);
    }
  });

  it('still merges a curated pick when the discovered twin has no distance', () => {
    const out = mergeLocalPlaces([rec({ id: 'r1' })], [place({ distance_m: null })]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('curated');
  });
});

describe('compareLocalPlaces ranking', () => {
  function m(over: Partial<MergedLocalPlace>): MergedLocalPlace {
    return {
      id: 'x',
      name: 'X',
      category: 'cafe',
      host_notes: null,
      host_starred: false,
      rating: null,
      distance_m: null,
      source: 'discovered',
      detail: null,
      distanceNote: null,
      priority: 0,
      ...over,
    };
  }

  it('hard-pins favorites above everything, including a closer higher-rated place', () => {
    const fav = m({ id: 'fav', host_starred: true, rating: 3.0, distance_m: 5000 });
    const other = m({ id: 'other', host_starred: false, rating: 5.0, distance_m: 100 });
    expect([other, fav].sort(compareLocalPlaces)[0].id).toBe('fav');
  });

  it('orders by priority weight before source or rating', () => {
    const heavy = m({ id: 'heavy', priority: 5 });
    const light = m({ id: 'light', priority: 1, source: 'curated', rating: 5 });
    expect([light, heavy].sort(compareLocalPlaces)[0].id).toBe('heavy');
  });

  it('prefers a human-written row over a scraped one at equal weight', () => {
    const curated = m({ id: 'c', source: 'curated' });
    const discovered = m({ id: 'd', source: 'discovered' });
    expect([discovered, curated].sort(compareLocalPlaces)[0].id).toBe('c');
  });

  it('sorts unrated places last rather than first', () => {
    const rated = m({ id: 'rated', rating: 4.0 });
    const unrated = m({ id: 'unrated', rating: null });
    expect([unrated, rated].sort(compareLocalPlaces)[0].id).toBe('rated');
  });

  it('sorts unknown distances last rather than as zero', () => {
    const near = m({ id: 'near', distance_m: 300 });
    const unknown = m({ id: 'unknown', distance_m: null });
    expect([unknown, near].sort(compareLocalPlaces)[0].id).toBe('near');
  });

  it('is a stable total order, so identical inputs always render the same way', () => {
    const a = m({ id: 'a', name: 'Alpha' });
    const b = m({ id: 'b', name: 'Beta' });
    expect([b, a].sort(compareLocalPlaces).map((p) => p.id)).toEqual(['a', 'b']);
    expect([a, b].sort(compareLocalPlaces).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
