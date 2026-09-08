import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchNearbyPlaces } from '@/lib/local/osm';
import { log } from '@/lib/log';
import { normalizePlaceName } from '@/lib/local/dedupe';
import { safePhone, safeWebsite, validCoordinates } from '@/lib/local/validation';
import { haversineMeters } from '@/lib/local/distance';

// Durable discovery uses OSM only. Mapbox Search Box results must never be stored.
// Refresh cadence: a property's nearby set is re-fetched at most once every 30 days
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

// Caller must authorize editBrain for this property before invoking the service
// role. Only canonical suggestions are written; guests see them after approval.
export async function refreshNearbyPlaces(
  propertyId: string,
  coords: { lat: number | null; lng: number | null },
): Promise<RefreshResult> {
  if (!validCoordinates(coords.lat, coords.lng)) {
    return { ok: false, found: 0, skipped: 'no_coords' };
  }

  try {
  const fetched = await fetchNearbyPlaces({
    lat: coords.lat!,
    lng: coords.lng!,
    radiusMeters: NEARBY_RADIUS_M,
    perCategoryLimit: PER_CATEGORY_LIMIT,
    throwOnError: true,
  });
  const places = capPerCategory(fetched.filter((place) => (
    validCoordinates(place.lat, place.lng) && place.name.trim() &&
    haversineMeters(coords.lat!, coords.lng!, place.lat, place.lng) <= NEARBY_RADIUS_M
  )));

  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (places.length === 0) {
    return { ok: true, found: 0, skipped: 'no_results' };
  }

  // This provider identity has a partial unique index, which PostgREST's bare
  // onConflict cannot infer. Reuse existing immutable business records, insert
  // missing ones, then re-read on a concurrent insert conflict.
  const providerIds = places.map((place) => place.placeId);
  const { data: existing, error: readError } = await admin.from('places')
    .select('id, provider_place_id').eq('provider', 'osm').in('provider_place_id', providerIds);
  if (readError) throw readError;
  const idsByProviderId = new Map((existing ?? []).map((place) => [place.provider_place_id, place.id]));
  for (const place of places) {
    if (idsByProviderId.has(place.placeId)) continue;
    const { data: inserted, error: insertError } = await admin.from('places').insert({
      provider: 'osm',
      provider_place_id: place.placeId,
      name: place.name,
      normalized_name: normalizePlaceName(place.name),
      category: place.category,
      address: place.address ?? null,
      lat: place.lat,
      lon: place.lng,
      phone: safePhone(place.phone) ? place.phone : null,
      website: safeWebsite(place.url),
      provider_payload: null,
      last_refreshed_at: now,
    }).select('id').single();
    if (insertError?.code === '23505') {
      const { data: concurrent, error } = await admin.from('places').select('id')
        .eq('provider', 'osm').eq('provider_place_id', place.placeId).single();
      if (error || !concurrent) throw error ?? new Error('Place was not saved');
      idsByProviderId.set(place.placeId, concurrent.id);
    } else {
      if (insertError || !inserted) throw insertError ?? new Error('Place was not saved');
      idsByProviderId.set(place.placeId, inserted.id);
    }
  }
    const recommendationRows = places.flatMap((place) => {
      const placeId = idsByProviderId.get(place.placeId);
      return placeId
        ? [{
          property_id: propertyId,
          place_id: placeId,
          status: 'suggested',
          distance_miles: haversineMeters(coords.lat!, coords.lng!, place.lat, place.lng) / 1609.344,
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
        throw relationshipError;
      }
    }
  log.info('nearby_refreshed', { provider: 'osm', found: recommendationRows.length });
  return { ok: true, found: recommendationRows.length };
  } catch {
    log.warn('nearby_refresh_failed', { propertyId });
    return { ok: false, found: 0, error: 'Nearby suggestions could not be loaded. Please try again.' };
  }
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
