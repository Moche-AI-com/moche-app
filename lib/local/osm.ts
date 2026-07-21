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
  aiSource: 'osm_overpass';
  // Optional website/phone when OSM tags carry them.
  url: string | null;
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
