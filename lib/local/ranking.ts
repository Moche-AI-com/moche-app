export type PlaceRecommendationStatus = 'suggested' | 'approved' | 'hidden';

export interface RankedPlace {
  /** Stable canonical relationship id; final tie-break for deterministic ranking. */
  recommendationId: string;
  status: PlaceRecommendationStatus;
  intentTags: string[];
  hostNote: string | null;
  tags: string[];
  isFavorite: boolean;
  distanceMiles: number | null;
  lastRefreshedAt: string | null;
  name: string;
}

function intentScore(place: RankedPlace, guestIntentTags: readonly string[]): number {
  if (guestIntentTags.length === 0) return 0;
  const wanted = new Set(guestIntentTags);
  return place.intentTags.filter((tag) => wanted.has(tag)).length;
}

function statusScore(status: PlaceRecommendationStatus): number {
  return status === 'approved' ? 2 : status === 'suggested' ? 1 : 0;
}

function freshness(value: string | null): number {
  const time = value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Host-approved places always lead; each later tier only breaks a tie. */
export function comparePlacesForGuest(a: RankedPlace, b: RankedPlace, guestIntentTags: readonly string[] = []): number {
  const status = statusScore(b.status) - statusScore(a.status);
  if (status) return status;

  const intent = intentScore(b, guestIntentTags) - intentScore(a, guestIntentTags);
  if (intent) return intent;

  const hostContext = Number(Boolean(b.hostNote?.trim()) || b.tags.length > 0)
    - Number(Boolean(a.hostNote?.trim()) || a.tags.length > 0);
  if (hostContext) return hostContext;

  if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;

  const distanceA = a.distanceMiles ?? Number.POSITIVE_INFINITY;
  const distanceB = b.distanceMiles ?? Number.POSITIVE_INFINITY;
  if (distanceA !== distanceB) return distanceA - distanceB;

  const refreshed = freshness(b.lastRefreshedAt) - freshness(a.lastRefreshedAt);
  if (refreshed) return refreshed;
  const name = a.name.localeCompare(b.name);
  if (name) return name;
  return a.recommendationId.localeCompare(b.recommendationId);
}

export function rankPlacesForGuest(places: RankedPlace[], guestIntentTags: readonly string[] = []): RankedPlace[] {
  return [...places].filter((place) => place.status !== 'hidden').sort((a, b) => comparePlacesForGuest(a, b, guestIntentTags));
}
