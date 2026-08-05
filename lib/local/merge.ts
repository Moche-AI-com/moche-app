// Unifies the two local-places systems for guest-facing retrieval.
//
// THE PROBLEM THIS SOLVES
// The product has two live, independently built tables:
//
//   nearby_places  - auto-discovered from Mapbox/OSM, refreshed every 30 days,
//                    disposable. Has distance_m, rating, review_count, and a
//                    host star/hide/note lifecycle layered on top.
//   recommendations - host-AUTHORED curation. Hand-written descriptions, an
//                    approval gate, a loved/neutral/disliked preference, and a
//                    priority_weight. Durable; nothing regenerates it.
//
// The concierge only ever read nearby_places. That made the recommendations
// manager's own promise to the host - "Approved places (and your favorites
// first) are shared with the concierge" - false: hand-curated, explicitly
// approved places were silently invisible to the AI.
//
// THE DECISION (backlog P4-12)
// Both tables survive. They are not two versions of one thing; they are a
// disposable discovery cache and a durable human artifact, and collapsing them
// would mean either throwing away hand-written curation on the next 30-day
// refresh or freezing the refresh job. Instead they are merged at READ time
// into one ranked list, with curated rows outranking discovered ones and a
// dedupe pass so a place that exists in both is shown once.
//
// This module is pure so the ranking and dedupe rules are unit-testable without
// a database.

import { NEARBY_CATEGORY_LABEL } from './categories';

export type LocalSource = 'curated' | 'discovered';

/** A row from `recommendations`, host-authored. */
export interface CuratedRecInput {
  id: string;
  name: string;
  category: string | null;
  host_preference: string;
  approved: boolean;
  hidden: boolean;
  host_note: string | null;
  description: string | null;
  distance_note: string | null;
  priority_weight: number;
}

/** A row from `nearby_places`, auto-discovered. */
export interface DiscoveredPlaceInput {
  id: string;
  name: string | null;
  category: string;
  host_notes: string | null;
  host_starred: boolean;
  hidden: boolean;
  rating: number | null;
  distance_m: number | null;
}

/**
 * Structurally a superset of concierge.ts's NearbyPlaceRow, on purpose: the
 * existing context builder and the WS-5 citation resolver both accept it with
 * no signature change and no change to their tests.
 */
export interface MergedLocalPlace {
  id: string;
  name: string | null;
  category: string;
  host_notes: string | null;
  host_starred: boolean;
  rating: number | null;
  distance_m: number | null;
  source: LocalSource;
  /** The host's own written description. Curated rows only. */
  detail: string | null;
  /** Human distance string ("about 5 min drive"). Curated rows only. */
  distanceNote: string | null;
  /** From recommendations.priority_weight. 0 for discovered rows. */
  priority: number;
}

/**
 * `recommendations.category` is free text and drifted from the canonical
 * nearby-place keys before this merge existed. Only real, observed divergences
 * are mapped; anything unknown passes through so a new host-entered category
 * still renders (falling back to the raw key as its own label).
 */
const CATEGORY_ALIASES: Record<string, string> = {
  attraction: 'tourist_attraction',
  attractions: 'tourist_attraction',
  restaurants: 'restaurant',
  cafes: 'cafe',
  coffee: 'cafe',
  bars: 'bar',
  groceries: 'grocery',
  supermarket: 'grocery',
  park: 'park',
  parks: 'park',
};

export function normalizeLocalCategory(raw: string | null | undefined): string {
  if (!raw) return 'tourist_attraction';
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return CATEGORY_ALIASES[key] ?? key;
}

export function localCategoryLabel(category: string): string {
  return NEARBY_CATEGORY_LABEL[category] ?? category.replace(/_/g, ' ');
}

/**
 * Dedupe key. Names are compared case-insensitively with punctuation and
 * corporate suffixes stripped, because the same coffee shop is realistically
 * "Blue Bottle Coffee" from Mapbox and "Blue Bottle" from the host.
 * Category is part of the key so a restaurant and a park that happen to share
 * a name are not collapsed.
 */
export function localDedupeKey(name: string | null, category: string): string {
  const n = (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(the|inc|llc|ltd|co|company|restaurant|cafe|coffee|bar|grill)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  return `${category}:${n}`;
}

function curatedToMerged(r: CuratedRecInput): MergedLocalPlace {
  return {
    id: r.id,
    name: r.name,
    category: normalizeLocalCategory(r.category),
    // host_note is the private operational note; description is the guest-facing
    // blurb. The concierge gets host_note in the same slot discovered rows use,
    // so downstream formatting needs no special case.
    host_notes: r.host_note,
    // 'loved' is the curated equivalent of a star. This is what makes a curated
    // favorite hard-pin ahead of everything else.
    host_starred: r.host_preference === 'loved',
    rating: null,
    distance_m: null,
    source: 'curated',
    detail: r.description,
    distanceNote: r.distance_note,
    priority: r.priority_weight,
  };
}

function discoveredToMerged(p: DiscoveredPlaceInput): MergedLocalPlace {
  return {
    id: p.id,
    name: p.name,
    category: normalizeLocalCategory(p.category),
    host_notes: p.host_notes,
    host_starred: p.host_starred,
    rating: p.rating,
    distance_m: p.distance_m,
    source: 'discovered',
    detail: null,
    distanceNote: null,
    priority: 0,
  };
}

/**
 * Which curated rows a guest may see. Deliberately strict and matching what the
 * recommendations manager tells the host:
 *  - `approved` must be true (that IS the publish gate)
 *  - `hidden` must be false
 *  - `disliked` is excluded even when approved, because a host marking a place
 *    disliked is a clearer signal of intent than a stale approval flag
 */
export function isGuestVisibleCuratedRec(r: CuratedRecInput): boolean {
  return r.approved && !r.hidden && r.host_preference !== 'disliked';
}

/**
 * How close two same-named, same-category places must be before they are treated
 * as one physical place rather than two branches of a chain.
 *
 * A name match alone is not enough. Two genuine Starbucks a mile apart are two
 * places a guest may want, and silently dropping one would be a data-loss bug
 * caused by the dedupe. Observed real duplicates in production sit 3m and 30m
 * apart (the same restaurant and the same convenience store indexed twice by
 * the provider), so this threshold separates "indexed twice" from "two branches"
 * with a wide margin on both sides.
 *
 * Applies only when BOTH rows have a known distance. Curated rows carry no
 * measured distance, so a curated row always merges into its discovered twin -
 * which is the intended behavior.
 */
export const SAME_PLACE_RADIUS_M = 150;

function isSamePhysicalPlace(a: MergedLocalPlace, b: MergedLocalPlace): boolean {
  if (a.distance_m === null || b.distance_m === null) return true;
  return Math.abs(a.distance_m - b.distance_m) <= SAME_PLACE_RADIUS_M;
}

/**
 * Merge, dedupe, and rank. Curated wins a name collision, but inherits the
 * discovered row's distance and rating so nothing measurable is lost by
 * preferring the human-written record.
 *
 * Buckets are keyed by name+category but hold a LIST, because a name collision
 * is only a duplicate when the two rows are also in the same place - see
 * SAME_PLACE_RADIUS_M.
 */
export function mergeLocalPlaces(
  curated: CuratedRecInput[],
  discovered: DiscoveredPlaceInput[],
): MergedLocalPlace[] {
  const byKey = new Map<string, MergedLocalPlace[]>();

  const bucket = (m: MergedLocalPlace) => {
    const key = localDedupeKey(m.name, m.category);
    const list = byKey.get(key);
    if (list) return list;
    const fresh: MergedLocalPlace[] = [];
    byKey.set(key, fresh);
    return fresh;
  };

  for (const r of curated) {
    if (!isGuestVisibleCuratedRec(r)) continue;
    const m = curatedToMerged(r);
    const list = bucket(m);
    // Curated rows have no measured distance, so two same-named curated rows are
    // always treated as the same place. The first one wins; callers pass rows
    // pre-sorted by priority so that is the higher-priority one.
    if (list.some((e) => isSamePhysicalPlace(e, m))) continue;
    list.push(m);
  }

  // Nearest-first so the result does not depend on the caller's ordering. A
  // curated row has no distance of its own and therefore matches the first
  // same-named discovered row it meets; processing nearest-first guarantees that
  // is the closest branch, which is the one a guest means.
  const nearestFirst = [...discovered].sort(
    (a, b) => (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY),
  );

  for (const p of nearestFirst) {
    if (p.hidden) continue;
    const m = discoveredToMerged(p);
    const list = bucket(m);
    const twin = list.find((e) => isSamePhysicalPlace(e, m));
    if (!twin) {
      // Same name, different location: a separate branch, not a duplicate.
      list.push(m);
      continue;
    }
    // Absorb the facts only the discovery pipeline has, and let a star on either
    // record count as a favorite.
    twin.distance_m = twin.distance_m ?? m.distance_m;
    twin.rating = twin.rating ?? m.rating;
    twin.host_starred = twin.host_starred || m.host_starred;
    twin.host_notes = twin.host_notes ?? m.host_notes;
  }

  return [...byKey.values()].flat().sort(compareLocalPlaces);
}

/**
 * Ranking, most significant first:
 *  1. favorites (hard pin - the host explicitly said "send guests here")
 *  2. priority_weight, descending
 *  3. curated before discovered at equal weight - a human wrote it
 *  4. rating, descending (nulls last)
 *  5. distance, ascending (nulls last)
 *  6. name, for a stable, reproducible order
 */
export function compareLocalPlaces(a: MergedLocalPlace, b: MergedLocalPlace): number {
  if (a.host_starred !== b.host_starred) return a.host_starred ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.source !== b.source) return a.source === 'curated' ? -1 : 1;
  const ra = a.rating ?? -1;
  const rb = b.rating ?? -1;
  if (ra !== rb) return rb - ra;
  const da = a.distance_m ?? Number.POSITIVE_INFINITY;
  const db = b.distance_m ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return (a.name ?? '').localeCompare(b.name ?? '');
}
