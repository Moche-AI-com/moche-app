import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { geoNearbyPlaces } from '@/lib/local/geo';
import { log } from '@/lib/log';

// Refresh cadence: a property's nearby set is re-fetched from the geo provider
// (Mapbox when a key is present, Overpass otherwise) at most once every 30 days
// unless a host forces it. Place data is slow-moving, and caching in our own
// table means guest traffic never fans out to a third-party API.
export const NEARBY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
export const NEARBY_RADIUS_M = 2000;
const PER_CATEGORY_LIMIT = 15;

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

  const { places, provider } = await geoNearbyPlaces({
    lat: coords.lat,
    lng: coords.lng,
    radiusMeters: NEARBY_RADIUS_M,
    perCategoryLimit: PER_CATEGORY_LIMIT,
  });

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
