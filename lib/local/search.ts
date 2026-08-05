// Hybrid Local search (backlog P4-13).
//
// THE RULE THIS ENCODES
// Search the host's own local data first. Only when that returns fewer than
// LOCAL_SEARCH_MIN_RESULTS matches does the caller reach out to Mapbox, and every
// row that comes back is labelled with where it came from. Three reasons the
// order matters:
//
//   1. Cost. Mapbox is billed per request. A property with a well-curated Local
//      list should never generate provider traffic for a search it can answer.
//   2. Trust. A host's own approved recommendation is a better answer than a
//      provider listing, so it must never be outranked by one.
//   3. Honesty. A host has to be able to tell "this is already in my list" from
//      "this is a suggestion from the map provider I have not added yet",
//      because those imply completely different next actions.
//
// Pure module: the ranking, the threshold, and the labels are unit-tested with no
// database and no network.

import { localCategoryLabel, type MergedLocalPlace } from './merge';

/** Below this many local matches, the caller may ask the map provider. */
export const LOCAL_SEARCH_MIN_RESULTS = 3;

/** Hard ceiling on a response, local and remote combined. */
export const LOCAL_SEARCH_MAX_RESULTS = 12;

/** Shorter queries match too much to be useful. */
export const LOCAL_SEARCH_MIN_QUERY = 2;

export type LocalSearchSource = 'curated' | 'discovered' | 'mapbox';

export interface LocalSearchResult {
  /** Stable within a response. Remote rows are prefixed so they can never be
   *  mistaken for one of our row ids by a client that tries to act on them. */
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  source: LocalSearchSource;
  sourceLabel: string;
  /** True only for rows that already exist in this property's Local data. */
  inLibrary: boolean;
  favorite: boolean;
  distanceMeters: number | null;
  rating: number | null;
  detail: string | null;
  address: string | null;
  /** Relevance score, highest first. Exposed for debugging and for tests. */
  score: number;
}

/** What the host reads on the badge. Never provider jargon. */
export function sourceLabel(source: LocalSearchSource): string {
  switch (source) {
    case 'curated': return 'Your pick';
    case 'discovered': return 'Discovered';
    case 'mapbox': return 'Map suggestion';
  }
}

export function normalizeQuery(raw: string): string {
  return (raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function tokenize(raw: string): string[] {
  return normalizeQuery(raw)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function isSearchableQuery(raw: string): boolean {
  return normalizeQuery(raw).length >= LOCAL_SEARCH_MIN_QUERY;
}

export interface ScorableFields {
  name: string | null;
  category: string;
  detail?: string | null;
  hostNotes?: string | null;
  favorite?: boolean;
}

/**
 * Relevance for one candidate. 0 means "no match" and the caller must drop it -
 * a scored-but-irrelevant row padding the list to three would defeat the whole
 * point of the fallback threshold.
 */
export function scoreLocalMatch(query: string, fields: ScorableFields): number {
  const q = normalizeQuery(query);
  if (q.length < LOCAL_SEARCH_MIN_QUERY) return 0;

  const name = normalizeQuery(fields.name ?? '');
  const catLabel = normalizeQuery(localCategoryLabel(fields.category));
  const catKey = normalizeQuery(fields.category.replace(/_/g, ' '));
  const haystack = normalizeQuery(
    [fields.detail ?? '', fields.hostNotes ?? ''].join(' '),
  );

  let score = 0;
  if (name) {
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
  }

  if (score === 0) {
    const tokens = tokenize(q);
    if (tokens.length > 1 && tokens.every((t) => name.includes(t))) score = 50;
  }

  if (score === 0 && (catLabel === q || catKey === q)) score = 40;
  if (score === 0 && (catLabel.includes(q) || catKey.includes(q))) score = 30;
  if (score === 0 && haystack.includes(q)) score = 20;

  if (score === 0) return 0;
  // A host favorite is the answer they most likely meant, but only as a nudge
  // within a tier - never enough to jump a weaker match over an exact name hit.
  if (fields.favorite) score += 5;
  return score;
}

function compareResults(a: LocalSearchResult, b: LocalSearchResult): number {
  if (b.score !== a.score) return b.score - a.score;
  // Rows already in the library outrank provider suggestions at equal relevance.
  if (a.inLibrary !== b.inLibrary) return a.inLibrary ? -1 : 1;
  if (a.source !== b.source && (a.source === 'curated' || b.source === 'curated')) {
    return a.source === 'curated' ? -1 : 1;
  }
  const ad = a.distanceMeters ?? Number.POSITIVE_INFINITY;
  const bd = b.distanceMeters ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;
  return a.name.localeCompare(b.name);
}

/** Search the property's merged local list. Nothing here touches the network. */
export function searchLocalPlaces(
  query: string,
  places: MergedLocalPlace[],
  limit: number = LOCAL_SEARCH_MAX_RESULTS,
): LocalSearchResult[] {
  if (!isSearchableQuery(query)) return [];

  const out: LocalSearchResult[] = [];
  for (const p of places) {
    const score = scoreLocalMatch(query, {
      name: p.name,
      category: p.category,
      detail: p.detail,
      hostNotes: p.host_notes,
      favorite: p.host_starred,
    });
    if (score === 0) continue;
    out.push({
      id: p.id,
      name: p.name ?? 'Unnamed place',
      category: p.category,
      categoryLabel: localCategoryLabel(p.category),
      source: p.source,
      sourceLabel: sourceLabel(p.source),
      inLibrary: true,
      favorite: p.host_starred,
      distanceMeters: p.distance_m,
      rating: p.rating,
      detail: p.detail ?? p.host_notes ?? null,
      address: null,
      score,
    });
  }

  return out.sort(compareResults).slice(0, Math.max(0, limit));
}

/**
 * The threshold decision, isolated so there is exactly one place that answers
 * "should we spend a provider call?".
 */
export function needsRemoteFallback(localMatchCount: number): boolean {
  return localMatchCount < LOCAL_SEARCH_MIN_RESULTS;
}

/**
 * Mapbox canonical category id -> our own category key.
 *
 * Only the ids that correspond to a category we already render are mapped; a
 * provider category we do not model falls back to `tourist_attraction`, which is
 * the same default normalizeLocalCategory uses, so a suggestion is never dropped
 * just because the provider used a taxonomy we do not mirror.
 */
const PROVIDER_CATEGORY_MAP: Record<string, string> = {
  restaurant: 'restaurant',
  food: 'restaurant',
  food_and_drink: 'restaurant',
  coffee_shop: 'cafe',
  coffee: 'cafe',
  cafe: 'cafe',
  bar: 'bar',
  nightlife: 'bar',
  bakery: 'bakery',
  grocery: 'grocery',
  supermarket: 'grocery',
  convenience_store: 'convenience_store',
  pharmacy: 'pharmacy',
  hospital: 'hospital',
  medical_practice: 'hospital',
  tourist_attraction: 'tourist_attraction',
  historic_site: 'tourist_attraction',
  museum: 'tourist_attraction',
  park: 'park',
  garden: 'park',
  golf_course: 'golf_course',
  gas_station: 'gas_station',
};

export function providerCategoryToLocal(raw: string | null | undefined): string {
  if (!raw) return 'tourist_attraction';
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PROVIDER_CATEGORY_MAP[key] ?? 'tourist_attraction';
}

/** A provider hit, before it is labelled and de-duplicated against local rows. */
export interface RemoteCandidate {
  key: string;
  name: string;
  category: string;
  address: string | null;
  distanceMeters: number | null;
}

/**
 * Folds provider results in behind the local ones.
 *
 * Anything whose name already appears in the local matches is dropped: showing a
 * host a "map suggestion" for a place they have already curated is the single
 * most confusing outcome this feature could produce.
 */
export function mergeRemoteResults(
  query: string,
  local: LocalSearchResult[],
  remote: RemoteCandidate[],
  limit: number = LOCAL_SEARCH_MAX_RESULTS,
): LocalSearchResult[] {
  const seen = new Set(local.map((r) => normalizeQuery(r.name)));
  const added: LocalSearchResult[] = [];

  for (const c of remote) {
    const name = c.name.trim();
    if (!name) continue;
    const key = normalizeQuery(name);
    if (seen.has(key)) continue;
    seen.add(key);

    const score = scoreLocalMatch(query, { name, category: c.category });
    added.push({
      id: `mapbox:${c.key}`,
      name,
      category: c.category,
      categoryLabel: localCategoryLabel(c.category),
      source: 'mapbox',
      sourceLabel: sourceLabel('mapbox'),
      inLibrary: false,
      favorite: false,
      distanceMeters: c.distanceMeters,
      rating: null,
      detail: null,
      address: c.address,
      // A provider row never outranks a local row of the same relevance; the
      // inLibrary tiebreak in compareResults handles equal scores, and a floor of
      // 1 keeps a loosely-matching suggestion visible rather than silently gone.
      score: Math.max(1, score),
    });
  }

  return [...local, ...added].sort(compareResults).slice(0, Math.max(0, limit));
}
