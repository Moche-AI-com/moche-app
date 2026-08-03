import { describe, it, expect } from 'vitest';
import { splitSuggestions, splitTrailingDirectives, resolvePlaceRefs, type NearbyPlaceRow } from './concierge';

const PLACES: NearbyPlaceRow[] = [
  { id: 'abc-123', category: 'restaurant', name: 'Otto Pizza', host_notes: null, host_starred: true, rating: 4.5, distance_m: 400 },
  { id: 'def-456', category: 'bar', name: 'The Burren', host_notes: 'Great trivia night', host_starred: false, rating: 4.2, distance_m: 900 },
];

// WS-5 — the model cites nearby places by id via a trailing `PLACES:` directive line.
// These tests cover parsing that directive (splitTrailingDirectives) and confirm the
// pre-existing SUGGESTIONS-only behavior (splitSuggestions) still works unchanged.

describe('splitSuggestions (legacy, SUGGESTIONS-only)', () => {
  it('strips a trailing SUGGESTIONS line and returns up to 3 items', () => {
    const raw = 'The pool opens at 8am.\n\nSUGGESTIONS: What time does it close? | Is there a lifeguard? | Can I bring guests?';
    const { answer, suggestions } = splitSuggestions(raw);
    expect(answer).toBe('The pool opens at 8am.');
    expect(suggestions).toEqual(['What time does it close?', 'Is there a lifeguard?', 'Can I bring guests?']);
  });

  it('returns the full trimmed text and an empty list when absent', () => {
    const { answer, suggestions } = splitSuggestions('Just an answer, no directive.');
    expect(answer).toBe('Just an answer, no directive.');
    expect(suggestions).toEqual([]);
  });
});

describe('splitTrailingDirectives', () => {
  it('parses SUGGESTIONS and PLACES together, SUGGESTIONS first', () => {
    const raw = [
      'Try Otto Pizza \u2014 it is a 5 minute walk.',
      '',
      'SUGGESTIONS: Any vegan options? | Do they deliver?',
      'PLACES: abc-123 | def-456',
    ].join('\n');
    const { answer, suggestions, placeIds } = splitTrailingDirectives(raw);
    expect(answer).toBe('Try Otto Pizza \u2014 it is a 5 minute walk.');
    expect(suggestions).toEqual(['Any vegan options?', 'Do they deliver?']);
    expect(placeIds).toEqual(['abc-123', 'def-456']);
  });

  it('parses PLACES when it appears before SUGGESTIONS', () => {
    const raw = 'Great choice.\n\nPLACES: xyz-789\nSUGGESTIONS: Anything else nearby?';
    const { answer, suggestions, placeIds } = splitTrailingDirectives(raw);
    expect(answer).toBe('Great choice.');
    expect(suggestions).toEqual(['Anything else nearby?']);
    expect(placeIds).toEqual(['xyz-789']);
  });

  it('parses a PLACES-only reply with no SUGGESTIONS line', () => {
    const raw = 'The bakery down the street has great croissants.\n\nPLACES: bakery-1';
    const { answer, suggestions, placeIds } = splitTrailingDirectives(raw);
    expect(answer).toBe('The bakery down the street has great croissants.');
    expect(suggestions).toEqual([]);
    expect(placeIds).toEqual(['bakery-1']);
  });

  it('caps PLACES at 4 ids and drops empty entries from stray separators', () => {
    const raw = 'Answer.\n\nPLACES: a | b |  | c | d | e';
    const { placeIds } = splitTrailingDirectives(raw);
    expect(placeIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns an empty placeIds list and the full text when no directive is present', () => {
    const { answer, suggestions, placeIds } = splitTrailingDirectives('Nothing special here.');
    expect(answer).toBe('Nothing special here.');
    expect(suggestions).toEqual([]);
    expect(placeIds).toEqual([]);
  });
});

describe('resolvePlaceRefs (WS-5 security: never trust the model\'s own text)', () => {
  it('resolves known ids to verified {id, name, category} from the DB list', () => {
    const refs = resolvePlaceRefs(['abc-123', 'def-456'], PLACES);
    expect(refs).toEqual([
      { id: 'abc-123', name: 'Otto Pizza', category: 'restaurant' },
      { id: 'def-456', name: 'The Burren', category: 'bar' },
    ]);
  });

  it('silently drops an id the model invented or that is not in the guest-visible list', () => {
    // Simulates a hallucinated id, or one belonging to a hidden/cross-property place
    // that was never included in the fetched list handed to the model.
    const refs = resolvePlaceRefs(['abc-123', 'not-a-real-id'], PLACES);
    expect(refs).toEqual([{ id: 'abc-123', name: 'Otto Pizza', category: 'restaurant' }]);
  });

  it('returns an empty list when every cited id is unresolvable', () => {
    expect(resolvePlaceRefs(['ghost-1', 'ghost-2'], PLACES)).toEqual([]);
  });

  it('returns an empty list when no ids were cited', () => {
    expect(resolvePlaceRefs([], PLACES)).toEqual([]);
  });

  it('dedupes a repeated id', () => {
    const refs = resolvePlaceRefs(['abc-123', 'abc-123'], PLACES);
    expect(refs).toHaveLength(1);
  });

  it('caps resolved refs at 4 even if more ids are somehow passed in', () => {
    const manyPlaces: NearbyPlaceRow[] = Array.from({ length: 6 }, (_, i) => ({
      id: `p-${i}`, category: 'cafe', name: `Cafe ${i}`, host_notes: null, host_starred: false, rating: null, distance_m: null,
    }));
    const refs = resolvePlaceRefs(manyPlaces.map((p) => p.id), manyPlaces);
    expect(refs).toHaveLength(4);
  });

  it('falls back to a friendly name when the DB name is null', () => {
    const noName: NearbyPlaceRow[] = [{ id: 'x', category: 'park', name: null, host_notes: null, host_starred: false, rating: null, distance_m: null }];
    const refs = resolvePlaceRefs(['x'], noName);
    expect(refs).toEqual([{ id: 'x', name: 'This place', category: 'park' }]);
  });
});
