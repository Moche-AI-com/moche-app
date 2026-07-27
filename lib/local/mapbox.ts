import 'server-only';
import { log } from '@/lib/log';
import type {
  AddressSuggestion,
  GeocodeResult,
  LocalPoi,
  NearbyCategory,
  NearbyPlace,
  PoiCategory,
} from '@/lib/local/osm';
import { NEARBY_CATEGORIES } from '@/lib/local/osm';

// ============================================================================
// Mapbox provider — the "key is present" upgrade tier for local intel.
//
// This is the paid-tier half of the free-first budget rule documented in
// lib/local/osm.ts. When MAPBOX_ACCESS_TOKEN is set we use Mapbox for
// geocoding, address autocomplete and POI discovery because it is materially
// better than Nominatim/Photon/Overpass for guest-facing data:
//   - rooftop-accuracy US addresses + structured context (postcode, region)
//   - POIs carry a real street address, phone, website and exact distance
//   - one predictable, rate-limited vendor instead of three volunteer endpoints
// When the token is absent every caller silently falls back to OSM (see geo.ts),
// so the product still works at $0.
//
// Security / compliance notes:
//   - The token lives ONLY in the server env. This module is `server-only`, so
//     it can never be bundled into client JS.
//   - The browser-safe map token is a separate, URL-restricted public token
//     (NEXT_PUBLIC_MAPBOX_TOKEN) used exclusively for rendering map images.
//   - No guest PII is ever sent to Mapbox. We send property addresses and
//     coordinates that the host entered themselves — never a guest identifier,
//     name, phone, email or stay detail.
//   - Discovery is host-triggered and cached in our own tables (30-day refresh
//     for nearby_places), so guest traffic never fans out to Mapbox.
// ============================================================================

const GEOCODE_V6 = 'https://api.mapbox.com/search/geocode/v6/forward';
const SEARCHBOX_CATEGORY = 'https://api.mapbox.com/search/searchbox/v1/category';

// Attributes we ask for on POI lookups: phone / website / opening hours.
const ATTRIBUTE_SETS = 'basic,visit';

export function mapboxToken(): string | null {
  const t = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  return t ? t : null;
}

export function hasMapbox(): boolean {
  return mapboxToken() !== null;
}

// ---------------------------------------------------------------------------
// Geocoding v6 — shared response shapes.
// ---------------------------------------------------------------------------
interface GeoV6Context {
  address?: { address_number?: string; street_name?: string; name?: string };
  street?: { name?: string };
  place?: { name?: string };
  locality?: { name?: string };
  district?: { name?: string };
  region?: { name?: string; region_code?: string };
  postcode?: { name?: string };
  country?: { name?: string; country_code?: string };
}

interface GeoV6Feature {
  id?: string;
  properties?: {
    mapbox_id?: string;
    feature_type?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: { latitude?: number; longitude?: number; accuracy?: string };
    context?: GeoV6Context;
  };
}

function line1From(ctx: GeoV6Context, name: string | undefined): string | null {
  const addr = ctx.address;
  const composed = [addr?.address_number, addr?.street_name].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  if (addr?.name) return addr.name;
  return name?.trim() || null;
}

function suggestionFrom(f: GeoV6Feature): AddressSuggestion | null {
  const p = f.properties;
  const lat = p?.coordinates?.latitude;
  const lng = p?.coordinates?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const ctx = p?.context ?? {};
  const label = p?.full_address
    ?? [p?.name, p?.place_formatted].filter(Boolean).join(', ')
    ?? '';
  if (!label) return null;

  return {
    key: p?.mapbox_id ?? f.id ?? `${lng},${lat}`,
    label,
    line1: line1From(ctx, p?.name),
    city: ctx.place?.name ?? ctx.locality?.name ?? ctx.district?.name ?? null,
    state: ctx.region?.name ?? null,
    postalCode: ctx.postcode?.name ?? null,
    country: ctx.country?.name ?? null,
    countryCode: ctx.country?.country_code?.toLowerCase() ?? null,
    lat,
    lng,
  };
}

// ---------------------------------------------------------------------------
// Address autocomplete. One call per keystroke-batch; coordinates come back
// inline so there is no second "retrieve" round-trip (and no session billing).
// ---------------------------------------------------------------------------
export async function mapboxAutocomplete(
  query: string,
  limit = 5,
  opts?: { countryCode?: string; proximity?: { lat: number; lng: number } },
): Promise<AddressSuggestion[]> {
  const token = mapboxToken();
  const q = query.trim();
  if (!token || q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    access_token: token,
    autocomplete: 'true',
    limit: String(Math.min(Math.max(limit, 1), 10)),
    types: 'address,street,place,postcode,locality,neighborhood',
  });
  if (opts?.countryCode) params.set('country', opts.countryCode.toLowerCase());
  if (opts?.proximity) params.set('proximity', `${opts.proximity.lng},${opts.proximity.lat}`);

  try {
    const res = await fetch(`${GEOCODE_V6}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) {
      log.warn('mapbox_autocomplete_failed', { status: res.status });
      return [];
    }
    const json = (await res.json()) as { features?: GeoV6Feature[] };
    const out: AddressSuggestion[] = [];
    for (const f of json.features ?? []) {
      const s = suggestionFrom(f);
      if (s) out.push(s);
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    log.warn('mapbox_autocomplete_error', { error: String(e) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Forward geocode a free-form address string to a single best coordinate.
// ---------------------------------------------------------------------------
export async function mapboxGeocode(address: string): Promise<GeocodeResult | null> {
  const token = mapboxToken();
  const q = address.trim();
  if (!token || !q) return null;

  const params = new URLSearchParams({ q, access_token: token, limit: '1' });
  try {
    const res = await fetch(`${GEOCODE_V6}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!res.ok) {
      log.warn('mapbox_geocode_failed', { status: res.status });
      return null;
    }
    const json = (await res.json()) as { features?: GeoV6Feature[] };
    const f = json.features?.[0];
    const lat = f?.properties?.coordinates?.latitude;
    const lng = f?.properties?.coordinates?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return {
      lat,
      lng,
      displayName: f?.properties?.full_address ?? f?.properties?.name ?? q,
    };
  } catch (e) {
    log.warn('mapbox_geocode_error', { error: String(e) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// POI discovery via the Search Box category endpoint.
// ---------------------------------------------------------------------------
interface SbFeature {
  properties?: {
    mapbox_id?: string;
    name?: string;
    address?: string;
    full_address?: string;
    distance?: number;
    coordinates?: { latitude?: number; longitude?: number };
    metadata?: { phone?: string; website?: string };
  };
}

// Our guest-facing recommendation categories -> Mapbox canonical category ids.
const POI_CATEGORY_MAP: Record<PoiCategory, string> = {
  restaurant: 'restaurant',
  cafe: 'coffee_shop',
  attraction: 'tourist_attraction',
  grocery: 'grocery',
  pharmacy: 'pharmacy',
  hospital: 'hospital',
};

// The 12 host-dashboard nearby categories -> Mapbox canonical category ids.
const NEARBY_CATEGORY_MAP: Record<NearbyCategory, string> = {
  restaurant: 'restaurant',
  cafe: 'coffee_shop',
  bar: 'bar',
  grocery: 'grocery',
  pharmacy: 'pharmacy',
  hospital: 'hospital',
  tourist_attraction: 'tourist_attraction',
  golf_course: 'golf_course',
  convenience_store: 'convenience_store',
  bakery: 'bakery',
  park: 'park',
  gas_station: 'gas_station',
};

// Radius -> bounding box, so category results stay genuinely local. Mapbox's
// category endpoint biases by `proximity` but only *hard*-limits by `bbox`.
function bboxFor(lat: number, lng: number, radiusM: number): string {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.max(0.15, Math.cos((lat * Math.PI) / 180)));
  const clampLat = (v: number) => Math.max(-90, Math.min(90, v));
  const clampLng = (v: number) => Math.max(-180, Math.min(180, v));
  return [
    clampLng(lng - dLng).toFixed(6),
    clampLat(lat - dLat).toFixed(6),
    clampLng(lng + dLng).toFixed(6),
    clampLat(lat + dLat).toFixed(6),
  ].join(',');
}

async function categorySearch(opts: {
  canonicalId: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  limit: number;
}): Promise<SbFeature[]> {
  const token = mapboxToken();
  if (!token) return [];
  const params = new URLSearchParams({
    access_token: token,
    proximity: `${opts.lng},${opts.lat}`,
    bbox: bboxFor(opts.lat, opts.lng, opts.radiusMeters),
    limit: String(Math.min(Math.max(opts.limit, 1), 25)),
    attribute_sets: ATTRIBUTE_SETS,
  });
  try {
    const res = await fetch(`${SEARCHBOX_CATEGORY}/${encodeURIComponent(opts.canonicalId)}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!res.ok) {
      log.warn('mapbox_category_failed', { status: res.status, category: opts.canonicalId });
      return [];
    }
    const json = (await res.json()) as { features?: SbFeature[] };
    return json.features ?? [];
  } catch (e) {
    log.warn('mapbox_category_error', { error: String(e), category: opts.canonicalId });
    return [];
  }
}

// Run one category request per category, in small concurrent batches so a
// 12-category refresh is fast without hammering the API.
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

// Guest-facing recommendation discovery (6 categories).
export async function mapboxNearbyPois(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  categories?: PoiCategory[];
  perCategoryLimit?: number;
}): Promise<LocalPoi[]> {
  if (!hasMapbox()) return [];
  const radius = opts.radiusMeters ?? 3000;
  const perCat = opts.perCategoryLimit ?? 6;
  const categories = opts.categories ?? (Object.keys(POI_CATEGORY_MAP) as PoiCategory[]);

  const results = await inBatches(categories, 3, async (cat) => {
    const feats = await categorySearch({
      canonicalId: POI_CATEGORY_MAP[cat],
      lat: opts.lat,
      lng: opts.lng,
      radiusMeters: radius,
      limit: perCat,
    });
    return { cat, feats };
  });

  const seen = new Set<string>();
  const out: LocalPoi[] = [];
  for (const { cat, feats } of results) {
    const mapped: LocalPoi[] = [];
    for (const f of feats) {
      const p = f.properties;
      const name = p?.name?.trim();
      const lat = p?.coordinates?.latitude;
      const lng = p?.coordinates?.longitude;
      if (!name || typeof lat !== 'number' || typeof lng !== 'number') continue;
      const dedupeKey = `${name.toLowerCase()}|${cat}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      mapped.push({
        name,
        category: cat,
        lat,
        lng,
        address: p?.address ?? p?.full_address ?? null,
        distanceMeters: typeof p?.distance === 'number' ? Math.round(p.distance) : null,
        aiSource: 'mapbox',
        url: p?.metadata?.website ?? null,
        phone: p?.metadata?.phone ?? null,
      });
    }
    mapped.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    out.push(...mapped.slice(0, perCat));
  }
  return out;
}

// Host-dashboard nearby discovery (12 categories).
export async function mapboxNearbyPlaces(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  perCategoryLimit?: number;
}): Promise<NearbyPlace[]> {
  if (!hasMapbox()) return [];
  const radius = opts.radiusMeters ?? 2000;
  const perCat = opts.perCategoryLimit ?? 15;

  const results = await inBatches(NEARBY_CATEGORIES, 4, async (cat) => {
    const feats = await categorySearch({
      canonicalId: NEARBY_CATEGORY_MAP[cat],
      lat: opts.lat,
      lng: opts.lng,
      radiusMeters: radius,
      limit: perCat,
    });
    return { cat, feats };
  });

  const seenIds = new Set<string>();
  const out: NearbyPlace[] = [];
  for (const { cat, feats } of results) {
    const mapped: NearbyPlace[] = [];
    for (const f of feats) {
      const p = f.properties;
      const name = p?.name?.trim();
      const lat = p?.coordinates?.latitude;
      const lng = p?.coordinates?.longitude;
      if (!name || typeof lat !== 'number' || typeof lng !== 'number') continue;
      // Stable, provider-prefixed id so Mapbox rows never collide with legacy
      // OSM rows in the (property_id, place_id) unique index.
      const placeId = `mapbox/${p?.mapbox_id ?? `${lat.toFixed(6)},${lng.toFixed(6)}`}`;
      if (seenIds.has(placeId)) continue;
      seenIds.add(placeId);
      mapped.push({
        placeId,
        category: cat,
        name,
        lat,
        lng,
        distanceMeters: typeof p?.distance === 'number'
          ? Math.round(p.distance)
          : Math.round(haversineMeters(opts.lat, opts.lng, lat, lng)),
        address: p?.address ?? p?.full_address ?? null,
        url: p?.metadata?.website ?? null,
        phone: p?.metadata?.phone ?? null,
      });
    }
    mapped.sort((a, b) => a.distanceMeters - b.distanceMeters);
    out.push(...mapped.slice(0, perCat));
  }
  return out;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
