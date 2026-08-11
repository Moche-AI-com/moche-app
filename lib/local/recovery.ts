export interface ProviderSearchOptions {
  query: string;
  category?: string | null;
  radiusMeters: number;
}

export interface ProviderPlace {
  id: string;
  provider: 'mapbox' | 'osm';
  providerPlaceId: string | null;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lon: number;
  distanceMeters: number | null;
}

export type RecoveryStep = 'category_retry' | 'wider_radius' | 'osm_fallback' | 'prefix_match' | 'browse' | 'manual';

export interface RecoveryResult {
  results: ProviderPlace[];
  step: RecoveryStep;
  browseCategory: string | null;
  manualAvailable: true;
}

export interface RecoveryProviders {
  mapbox(options: ProviderSearchOptions): Promise<ProviderPlace[]>;
  osm(options: ProviderSearchOptions): Promise<ProviderPlace[]>;
}

function prefixMatches(query: string, place: ProviderPlace): boolean {
  const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  const haystack = `${place.name} ${place.category}`.toLowerCase();
  return tokens.length > 0 && tokens.every((token) => haystack.split(/\W+/).some((word) => word.startsWith(token)));
}

/**
 * Recovery never returns an un-actionable empty state. Provider calls remain
 * injected so this flow can be regression-tested without a network request.
 */
export async function searchWithRecovery(
  query: string,
  category: string | null,
  providers: RecoveryProviders,
): Promise<RecoveryResult> {
  const initial = { query, category, radiusMeters: 8_000 };
  const exact = await providers.mapbox(initial);
  if (exact.length) return { results: exact, step: 'category_retry', browseCategory: null, manualAvailable: true };

  const withoutCategory = await providers.mapbox({ ...initial, category: null });
  if (withoutCategory.length) return { results: withoutCategory, step: 'wider_radius', browseCategory: null, manualAvailable: true };

  const wider = await providers.mapbox({ ...initial, category: null, radiusMeters: 25_000 });
  if (wider.length) return { results: wider, step: 'osm_fallback', browseCategory: null, manualAvailable: true };

  const osm = await providers.osm({ ...initial, category: null, radiusMeters: 25_000 });
  if (osm.length) return { results: osm, step: 'prefix_match', browseCategory: null, manualAvailable: true };

  const prefix = (await providers.osm({ ...initial, category: null, radiusMeters: 40_000 })).filter((place) => prefixMatches(query, place));
  if (prefix.length) return { results: prefix, step: 'browse', browseCategory: null, manualAvailable: true };

  return { results: [], step: 'manual', browseCategory: category ?? 'restaurant', manualAvailable: true };
}
