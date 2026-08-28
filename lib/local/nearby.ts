import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { geoNearbyPlaces } from '@/lib/local/geo';
import { log } from '@/lib/log';
import { normalizePlaceName } from '@/lib/local/dedupe';

// Refresh cadence: a property's nearby set is re-fetched from the geo provider
// (Mapbox when a key is present, Overpass otherwise) at most once every 30 days
// unless a host forces it. Place data is slow-moving, and caching in our own
// table means guest traffic never fans out to a third-party API.
export const NEARBY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
// Discovery radius: 10 miles (2026-08-28 directive; was ~5). The wider net captures
// the places guests actually ask about — beaches, golf, attractions, the good
// restaurant two towns over — and the per-category caps below still bound the total
// set, so a dense downtown property cannot flood the guide.
export const NEARBY_RADIUS_M = 16093;
const PER_CATEGORY_LIMIT = 15;

// Per-category write-time caps (2026-08-28). The provider-side perCategoryLimit above
// bounds what we FETCH; these bound what we STORE, per category, at the 10-mile
// radius. Food & drink and attractions get the most room — they are what guests ask
// about; essentials stay small on purpose: the fifth-closest pharmacy is not a
// recommendation, it's noise. Keys are lib/local/categories.ts NEARBY_CATEGORIES.
const CATEGORY_CAP: Record<string, number> = {
  restaurant: 20,
  tourist_attraction: 20,
  park: 12,
  cafe: 12,
  bar: 10,
  grocery: 8,
  bakery: 8,
  golf_course: 8,
  convenience_store: 6,
  pharmacy: 5,
  hospital: 4,
  gas_station: 4,
};
const CATEGORY_CAP_DEFAULT = 8;

/** Keep at most each category's cap, in the provider's (nearest-first) order. */
function capPerCategory<T extends { category: string }>(places: T[]): T[] {
  const counts = new Map<string, number>();
  return places.filter((p) => {
    const cap = CATEGORY_CAP[p.category] ?? CATEGORY_CAP_DEFAULT;
    const seen = counts.get(p.category) ?? 0;
    if (seen >= cap) return false;
    counts.set(p.category, seen + 1);
    return true;
  });
}

export interface RefreshResult {
  ok: boolean;
  found: number;
  skipped?: 'no_coords' | 'no_results';
  error?: string;
}

// Fetch nearby places for a property and upsert them into nearby_places.
// Preserves host curation (host_starred / host_notes / hidden) on conflict by
// only touching the discovery-owned columns. Runs as the service role so the
// bulk write bypasses RLS. Returns the count of rows written.
export async function refreshNearbyPlaces(
  propertyId: string,
  coords: { lat: number | null; lng: number | null },
): Promise<RefreshResult> {
  if (typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return { ok: false, found: 0, skipped: 'no_coords' };
  }

  const fetched = await geoNearbyPlaces({
    lat: coords.lat,
    lng: coords.lng,
    radiusMeters: NEARBY_RADIUS_M,
    perCategoryLimit: PER_CATEGORY_LIMIT,
  });
  const provider = fetched.provider;
  const places = capPerCategory(fetched.places);

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (places.length === 0) {
    // Still stamp refreshed_at on existing rows so we don't retry every request.
    await admin.from('nearby_places').update({ refreshed_at: now }).eq('property_id', propertyId);
    return { ok: true, found: 0, skipped: 'no_results' };
  }

  // Upsert on (property_id, place_id). host_* / hidden are omitted so a re-run
  // never clobbers host curation; column defaults apply only on first insert.
  const rows = places.map((p) => ({
    property_id: propertyId,
    place_id: p.placeId,
    category: p.category,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    distance_m: p.distanceMeters,
    address: p.address ?? null,
    url: p.url ?? null,
    phone: p.phone ?? null,
    source: provider,
    refreshed_at: now,
  }));

  const { error } = await admin
    .from('nearby_places')
    .upsert(rows, { onConflict: 'property_id,place_id', ignoreDuplicates: false });
  if (error) {
    log.warn('nearby_upsert_failed', { error: error.message });
    return { ok: false, found: 0, error: error.message };
  }

  // Mapbox search data is temporary-use and intentionally stays in the legacy
  // cache. OSM places are durable, so mirror those results into the canonical
  // tables. Relationship upserts use `ignoreDuplicates` to retain every host
  // decision (status, note, tags, intents, favorite) on a subsequent refresh.
  if (provider === 'osm') {
    const canonicalRows = places.map((place) => ({
      provider: 'osm',
      provider_place_id: place.placeId,
      name: place.name,
      normalized_name: normalizePlaceName(place.name),
      category: place.category,
      address: place.address ?? null,
      lat: place.lat,
      lon: place.lng,
      phone: place.phone ?? null,
      website: place.url ?? null,
      provider_payload: null,
      last_refreshed_at: now,
    }));
    const { data: canonicalPlaces, error: canonicalError } = await admin
      .from('places')
      .upsert(canonicalRows as never, { onConflict: 'provider,provider_place_id', ignoreDuplicates: false })
      .select('id, provider_place_id');
    if (canonicalError) {
      log.warn('canonical_places_upsert_failed', { propertyId, error: canonicalError.message });
      return { ok: false, found: 0, error: canonicalError.message };
    }

    const idsByProviderId = new Map((canonicalPlaces ?? []).map((place) => [place.provider_place_id, place.id]));
    const recommendationRows = places.flatMap((place) => {
      const placeId = idsByProviderId.get(place.placeId);
      return placeId
        ? [{
          property_id: propertyId,
          place_id: placeId,
          status: 'approved',
          distance_miles: place.distanceMeters / 1609.344,
        }]
        : [];
    });
    if (recommendationRows.length > 0) {
      const { error: relationshipError } = await admin
        .from('property_place_recommendations')
        .upsert(recommendationRows as never, {
          onConflict: 'property_id,place_id',
          ignoreDuplicates: true,
        });
      if (relationshipError) {
        log.warn('canonical_place_relationship_upsert_failed', { propertyId, error: relationshipError.message });
        return { ok: false, found: 0, error: relationshipError.message };
      }
    }
  }

  log.info('nearby_refreshed', { provider, found: rows.length });
  return { ok: true, found: rows.length };
}

// True when the property has never been discovered or its newest row is older
// than the refresh window — used to auto-refresh on host page load.
export async function isNearbyStale(propertyId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('nearby_places')
    .select('refreshed_at')
    .eq('property_id', propertyId)
    .order('refreshed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.refreshed_at) return true;
  return Date.now() - new Date(data.refreshed_at).getTime() > NEARBY_REFRESH_MS;
}
