import 'server-only';
import { log } from '@/lib/log';
import {
  geocodeAddress,
  photonAutocomplete,
  fetchNearbyPois,
  fetchNearbyPlaces,
  type AddressSuggestion,
  type GeocodeResult,
  type LocalPoi,
  type NearbyPlace,
  type PoiCategory,
} from '@/lib/local/osm';
import {
  hasMapbox,
  mapboxAutocomplete,
  mapboxGeocode,
  mapboxNearbyPois,
  mapboxNearbyPlaces,
} from '@/lib/local/mapbox';

// ============================================================================
// Geo provider facade. Every caller in the app goes through here instead of
// importing a provider directly.
//
// Policy: Mapbox when MAPBOX_ACCESS_TOKEN is present, free OSM otherwise, and
// OSM again as a runtime fallback whenever Mapbox returns nothing (quota,
// outage, thin coverage). This preserves the original free-first budget rule —
// the app is never *dependent* on a paid key — while giving hosts materially
// better addresses and richer place data when the key is there.
// ============================================================================

export type GeoProvider = 'mapbox' | 'osm';

export function geoProvider(): GeoProvider {
  return hasMapbox() ? 'mapbox' : 'osm';
}

export async function geoAutocomplete(
  query: string,
  limit = 5,
  opts?: { countryCode?: string; proximity?: { lat: number; lng: number } },
): Promise<{ suggestions: AddressSuggestion[]; provider: GeoProvider }> {
  if (hasMapbox()) {
    const hits = await mapboxAutocomplete(query, limit, opts);
    if (hits.length > 0) return { suggestions: hits, provider: 'mapbox' };
    log.info('geo_autocomplete_fallback', { reason: 'mapbox_empty' });
  }
  return { suggestions: await photonAutocomplete(query, limit), provider: 'osm' };
}

export async function geoGeocode(address: string): Promise<GeocodeResult | null> {
  if (hasMapbox()) {
    const hit = await mapboxGeocode(address);
    if (hit) return hit;
    log.info('geo_geocode_fallback', { reason: 'mapbox_empty' });
  }
  return geocodeAddress(address);
}

export async function geoNearbyPois(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  categories?: PoiCategory[];
  perCategoryLimit?: number;
}): Promise<{ pois: LocalPoi[]; provider: GeoProvider }> {
  if (hasMapbox()) {
    const pois = await mapboxNearbyPois(opts);
    if (pois.length > 0) return { pois, provider: 'mapbox' };
    log.info('geo_pois_fallback', { reason: 'mapbox_empty' });
  }
  return { pois: await fetchNearbyPois(opts), provider: 'osm' };
}

export async function geoNearbyPlaces(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  perCategoryLimit?: number;
}): Promise<{ places: NearbyPlace[]; provider: GeoProvider }> {
  if (hasMapbox()) {
    const places = await mapboxNearbyPlaces(opts);
    if (places.length > 0) return { places, provider: 'mapbox' };
    log.info('geo_places_fallback', { reason: 'mapbox_empty' });
  }
  return { places: await fetchNearbyPlaces(opts), provider: 'osm' };
}

// Full pipeline: address string -> coordinates -> nearby POIs (provider-aware).
export async function discoverLocalIntelViaProvider(
  address: string,
  opts?: { radiusMeters?: number; categories?: PoiCategory[] },
): Promise<{ geocode: GeocodeResult | null; pois: LocalPoi[]; provider: GeoProvider }> {
  const geocode = await geoGeocode(address);
  if (!geocode) return { geocode: null, pois: [], provider: geoProvider() };
  const { pois, provider } = await geoNearbyPois({
    lat: geocode.lat,
    lng: geocode.lng,
    radiusMeters: opts?.radiusMeters,
    categories: opts?.categories,
  });
  return { geocode, pois, provider };
}
