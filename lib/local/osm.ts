import 'server-only';
import { log } from '@/lib/log';

// ============================================================================
// Part C3 — Local intel from FREE OpenStreetMap sources.
//
// Nominatim (geocoding) + Overpass (POI search). No API key, $0. We query a
// small, fixed set of guest-useful categories within a radius of the property
// and return clean, de-duplicated results the host can review before anything
// is exposed to guests.
//
// Budget rule: free-first. A paid upgrade (Google Places / Yelp) is only wired
// in when a key is present (see enrichWithPaid stub) — otherwise we stop here.
//
// Etiquette: OSM public endpoints require a descriptive User-Agent and ask for
// low request rates. We geocode once, then run ONE Overpass query for all
// categories in a single round-trip.
// ============================================================================

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PHOTON = 'https://photon.komoot.io/api/';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'MocheAI/1.0 (+https://www.moche-ai.com; local-intel)';

export type PoiCategory =
  | 'restaurant'
  | 'cafe'
  | 'attraction'
  | 'grocery'
  | 'pharmacy'
  | 'hospital';

export interface LocalPoi {
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  address: string | null;
  distanceMeters: number | null;
  // Provenance so the host review UI can label the source.
  aiSource: 'osm_overpass' | 'mapbox';
  // Optional website/phone when the provider carries them.
  url: string | null;
  phone: string | null;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

// Maps our friendly category onto Overpass tag filters. Each entry becomes a
// node/way query. Kept small and high-signal for guests.
const CATEGORY_QUERY: Record<PoiCategory, string[]> = {
  restaurant: ['amenity=restaurant'],
  cafe: ['amenity=cafe'],
  attraction: ['tourism=attraction', 'tourism=museum', 'leisure=park'],
  grocery: ['shop=supermarket', 'shop=convenience'],
  pharmacy: ['amenity=pharmacy'],
  hospital: ['amenity=hospital', 'amenity=clinic'],
};

const DEFAULT_CATEGORIES: PoiCategory[] = [
  'restaurant', 'cafe', 'attraction', 'grocery', 'pharmacy', 'hospital',
];

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

// Geocode a free-form address string to lat/lng via Nominatim.
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '1', addressdetails: '0' });
  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      // Nominatim can be slow; keep a sane ceiling.
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      log.warn('nominatim_failed', { status: res.status });
      return null;
    }
    const arr = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    const hit = arr[0];
    if (!hit) return null;
    return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name };
  } catch (e) {
    log.warn('nominatim_error', { error: String(e) });
    return null;
  }
}

// Builds one Overpass QL query covering every requested category within radius.
function buildOverpassQuery(lat: number, lng: number, radiusM: number, categories: PoiCategory[]): string {
  const clauses: string[] = [];
  for (const cat of categories) {
    for (const tag of CATEGORY_QUERY[cat]) {
      const [k, v] = tag.split('=');
      // node + way so we catch both point and polygon POIs.
      clauses.push(`node[${k}=${v}](around:${radiusM},${lat},${lng});`);
      clauses.push(`way[${k}=${v}](around:${radiusM},${lat},${lng});`);
    }
  }
  return `[out:json][timeout:25];(${clauses.join('')});out center tags 60;`;
}

// Reverse-maps an OSM element's tags back to our category enum.
function categorize(tags: Record<string, string>): PoiCategory | null {
  if (tags.amenity === 'restaurant') return 'restaurant';
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.tourism === 'attraction' || tags.tourism === 'museum' || tags.leisure === 'park') return 'attraction';
  if (tags.shop === 'supermarket' || tags.shop === 'convenience') return 'grocery';
  if (tags.amenity === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital';
  return null;
}

function tagAddress(tags: Record<string, string>): string | null {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:city'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

interface OverpassElement {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Fetch nearby POIs. Returns a de-duplicated, distance-sorted list capped per category.
export async function fetchNearbyPois(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  categories?: PoiCategory[];
  perCategoryLimit?: number;
}): Promise<LocalPoi[]> {
  const radius = opts.radiusMeters ?? 3000;
  const categories = opts.categories ?? DEFAULT_CATEGORIES;
  const perCat = opts.perCategoryLimit ?? 6;
  const query = buildOverpassQuery(opts.lat, opts.lng, radius, categories);

  let elements: OverpassElement[] = [];
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      log.warn('overpass_failed', { status: res.status });
      return [];
    }
    const json = (await res.json()) as { elements?: OverpassElement[] };
    elements = json.elements ?? [];
  } catch (e) {
    log.warn('overpass_error', { error: String(e) });
    return [];
  }

  const seen = new Set<string>();
  const byCat = new Map<PoiCategory, LocalPoi[]>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue; // skip unnamed POIs — useless to guests
    const cat = categorize(tags);
    if (!cat) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const dedupeKey = `${name.toLowerCase()}|${cat}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const poi: LocalPoi = {
      name,
      category: cat,
      lat,
      lng,
      address: tagAddress(tags),
      distanceMeters: haversineMeters(opts.lat, opts.lng, lat, lng),
      aiSource: 'osm_overpass',
      url: tags.website ?? tags['contact:website'] ?? null,
      phone: tags.phone ?? tags['contact:phone'] ?? null,
    };
    const list = byCat.get(cat) ?? [];
    list.push(poi);
    byCat.set(cat, list);
  }

  // Sort each category by distance, cap, then flatten in a guest-friendly order.
  const out: LocalPoi[] = [];
  for (const cat of categories) {
    const list = (byCat.get(cat) ?? []).sort(
      (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
    );
    out.push(...list.slice(0, perCat));
  }
  return out;
}

// ============================================================================
// Feature 1 — Address autocomplete via Photon (free, keyless, OSM-based).
// We proxy Photon server-side (through /api/geo/autocomplete) so the descriptive
// User-Agent is always sent and the browser never hits the public endpoint
// directly. Debounce + a 5-result cap live on the client.
// ============================================================================

export interface AddressSuggestion {
  // A stable-ish key for React lists (osm type/id when present).
  key: string;
  // One-line human label for the dropdown.
  label: string;
  // Structured parts the form can auto-populate.
  line1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
    country?: string;
    osm_id?: number;
    osm_type?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

function photonLabel(p: NonNullable<PhotonFeature['properties']>): string {
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name || '';
  const parts = [line1, p.city ?? p.district ?? p.county, p.state, p.postcode, p.country]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

// Autocomplete a free-form address query. Returns up to `limit` suggestions.
export async function photonAutocomplete(query: string, limit = 5): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q, limit: String(Math.min(Math.max(limit, 1), 10)) });
  try {
    const res = await fetch(`${PHOTON}?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      log.warn('photon_failed', { status: res.status });
      return [];
    }
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const out: AddressSuggestion[] = [];
    for (const f of json.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const label = photonLabel(p);
      if (!label) continue;
      const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name || null;
      out.push({
        key: `${p.osm_type ?? ''}${p.osm_id ?? ''}` || `${coords[0]},${coords[1]}`,
        label,
        line1,
        city: p.city ?? p.district ?? p.county ?? null,
        state: p.state ?? null,
        postalCode: p.postcode ?? null,
        country: p.country ?? null,
        countryCode: p.countrycode ?? null,
        lat: coords[1],
        lng: coords[0],
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    log.warn('photon_error', { error: String(e) });
    return [];
  }
}

// ============================================================================
// Feature 5 — Auto-find nearby places (richer category set, one Overpass call).
// Distinct from the guest-facing `recommendations` discovery above: this feeds
// the `nearby_places` table + concierge injection with the 12 host-facing
// categories from the build brief.
// ============================================================================

export type NearbyCategory =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'grocery'
  | 'pharmacy'
  | 'hospital'
  | 'tourist_attraction'
  | 'golf_course'
  | 'convenience_store'
  | 'bakery'
  | 'park'
  | 'gas_station';

export const NEARBY_CATEGORIES: NearbyCategory[] = [
  'restaurant', 'cafe', 'bar', 'grocery', 'pharmacy', 'hospital',
  'tourist_attraction', 'golf_course', 'convenience_store', 'bakery', 'park', 'gas_station',
];

export interface NearbyPlace {
  // Provider-scoped id: "node/12345" (OSM) or "mapbox/<mapbox_id>".
  placeId: string;
  category: NearbyCategory;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  // Present when the provider supplies them (Mapbox does; Overpass sometimes).
  address?: string | null;
  url?: string | null;
  phone?: string | null;
}

// key=value tag filters per category (any match => that category).
const NEARBY_QUERY: Record<NearbyCategory, Array<[string, string]>> = {
  restaurant: [['amenity', 'restaurant']],
  cafe: [['amenity', 'cafe']],
  bar: [['amenity', 'bar'], ['amenity', 'pub']],
  grocery: [['shop', 'supermarket'], ['shop', 'grocery']],
  pharmacy: [['amenity', 'pharmacy']],
  hospital: [['amenity', 'hospital']],
  tourist_attraction: [['tourism', 'attraction']],
  golf_course: [['leisure', 'golf_course']],
  convenience_store: [['shop', 'convenience']],
  bakery: [['shop', 'bakery']],
  park: [['leisure', 'park']],
  gas_station: [['amenity', 'fuel']],
};

// Reverse-map an element's tags to a NearbyCategory (first match wins, in the
// same priority order as NEARBY_CATEGORIES so specific shops beat generic ones).
function categorizeNearby(tags: Record<string, string>): NearbyCategory | null {
  for (const cat of NEARBY_CATEGORIES) {
    for (const [k, v] of NEARBY_QUERY[cat]) {
      if (tags[k] === v) return cat;
    }
  }
  return null;
}

function buildNearbyQuery(lat: number, lng: number, radiusM: number): string {
  const clauses: string[] = [];
  const seen = new Set<string>();
  for (const cat of NEARBY_CATEGORIES) {
    for (const [k, v] of NEARBY_QUERY[cat]) {
      const tag = `${k}=${v}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      clauses.push(`node[${k}=${v}](around:${radiusM},${lat},${lng});`);
      clauses.push(`way[${k}=${v}](around:${radiusM},${lat},${lng});`);
    }
  }
  return `[out:json][timeout:25];(${clauses.join('')});out center tags 300;`;
}

// Fetch nearby places across all 12 categories in ONE Overpass round-trip.
// Returns distance-sorted results capped per category (nearest first).
export async function fetchNearbyPlaces(opts: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  perCategoryLimit?: number;
}): Promise<NearbyPlace[]> {
  const radius = opts.radiusMeters ?? 2000;
  const perCat = opts.perCategoryLimit ?? 15;
  const query = buildNearbyQuery(opts.lat, opts.lng, radius);

  let elements: OverpassElement[] = [];
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      log.warn('overpass_nearby_failed', { status: res.status });
      return [];
    }
    const json = (await res.json()) as { elements?: OverpassElement[] };
    elements = json.elements ?? [];
  } catch (e) {
    log.warn('overpass_nearby_error', { error: String(e) });
    return [];
  }

  const byCat = new Map<NearbyCategory, NearbyPlace[]>();
  const seenIds = new Set<string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue; // unnamed POIs are useless
    const cat = categorizeNearby(tags);
    if (!cat) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const placeId = `${el.type}/${(el as { id?: number }).id ?? `${lat},${lng}`}`;
    if (seenIds.has(placeId)) continue;
    seenIds.add(placeId);

    const list = byCat.get(cat) ?? [];
    list.push({
      placeId,
      category: cat,
      name,
      lat,
      lng,
      distanceMeters: haversineMeters(opts.lat, opts.lng, lat, lng),
      address: tagAddress(tags),
      url: tags.website ?? tags['contact:website'] ?? null,
      phone: tags.phone ?? tags['contact:phone'] ?? null,
    });
    byCat.set(cat, list);
  }

  const out: NearbyPlace[] = [];
  for (const cat of NEARBY_CATEGORIES) {
    const list = (byCat.get(cat) ?? []).sort((a, b) => a.distanceMeters - b.distanceMeters);
    out.push(...list.slice(0, perCat));
  }
  return out;
}

// Full pipeline: address string -> geocode -> nearby POIs. Returns [] on any failure.
export async function discoverLocalIntel(address: string, opts?: {
  radiusMeters?: number;
  categories?: PoiCategory[];
}): Promise<{ geocode: GeocodeResult | null; pois: LocalPoi[] }> {
  const geocode = await geocodeAddress(address);
  if (!geocode) return { geocode: null, pois: [] };
  const pois = await fetchNearbyPois({
    lat: geocode.lat,
    lng: geocode.lng,
    radiusMeters: opts?.radiusMeters,
    categories: opts?.categories,
  });
  return { geocode, pois };
}
