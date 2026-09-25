import { safePhone, safeWebsite, validCoordinates } from './validation';

export type StarterCategory = 'cafe' | 'grocery' | 'pharmacy' | 'park';

export interface FsqOsPlaceInput {
  fsq_place_id: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  date_refreshed: string | null;
  date_closed: string | null;
  website: string | null;
  tel: string | null;
  fsq_category_ids: string[] | null;
  unresolved_flags: string[] | null;
}

export interface StarterCandidate {
  source: 'fsq_os';
  providerId: string;
  name: string;
  category: StarterCategory;
  address: string | null;
  lat: number;
  lng: number;
  distanceMeters: number;
  website: string | null;
  phone: string | null;
  refreshedAt: string;
  snapshotDate: string;
  hostEndorsed: false;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const lat = toRadians(bLat - aLat);
  const lng = toRadians(bLng - aLng);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(lng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

/** Pure selection from a licensed OS dataset snapshot. Never fetches, stores, or publishes POIs. */
export function selectFsqOsStarters(rows: readonly FsqOsPlaceInput[], options: {
  propertyLat: number;
  propertyLng: number;
  snapshotDate: string;
  categoryById: Readonly<Record<string, StarterCategory>>;
  now?: Date;
  maxDistanceMeters?: number;
  maxAgeDays?: number;
  maxPerCategory?: number;
}): StarterCandidate[] {
  const now = options.now ?? new Date();
  const snapshot = Date.parse(options.snapshotDate);
  const maxDistance = Math.min(options.maxDistanceMeters ?? 3000, 3000);
  const maxAge = Math.min(options.maxAgeDays ?? 365, 365);
  const maxPerCategory = Math.min(options.maxPerCategory ?? 2, 4);
  if (!validCoordinates(options.propertyLat, options.propertyLng) ||
      !Number.isFinite(now.getTime()) || !Number.isFinite(snapshot) ||
      snapshot > now.getTime() || now.getTime() - snapshot > 90 * 86_400_000 ||
      maxDistance <= 0 || maxAge <= 0 || maxPerCategory <= 0) return [];

  const candidates: StarterCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.fsq_place_id?.trim();
    const name = row.name?.trim();
    if (!id || id.length > 128 || !name || name.length > 160 || seen.has(id) ||
        !validCoordinates(row.latitude, row.longitude) || !row.country ||
        !Array.isArray(row.unresolved_flags) || row.unresolved_flags.length > 0 ||
        row.date_closed !== null || !Array.isArray(row.fsq_category_ids)) continue;
    const refreshed = Date.parse(row.date_refreshed ?? '');
    if (!Number.isFinite(refreshed) || refreshed > now.getTime() ||
        now.getTime() - refreshed > maxAge * 86_400_000) continue;
    const category = row.fsq_category_ids.map((key) => options.categoryById[key]).find(Boolean);
    if (!category || !(['cafe', 'grocery', 'pharmacy', 'park'] as string[]).includes(category)) continue;
    const distance = distanceMeters(options.propertyLat, options.propertyLng, row.latitude!, row.longitude!);
    if (distance > maxDistance) continue;
    seen.add(id);
    const address = [row.address, row.locality, row.region].map((part) => part?.trim()).filter(Boolean).join(', ') || null;
    candidates.push({
      source: 'fsq_os', providerId: id, name, category, address,
      lat: row.latitude!, lng: row.longitude!, distanceMeters: distance,
      website: safeWebsite(row.website), phone: safePhone(row.tel) ? row.tel?.trim() ?? null : null,
      refreshedAt: row.date_refreshed!, snapshotDate: options.snapshotDate, hostEndorsed: false,
    });
  }
  const counts = new Map<StarterCategory, number>();
  return candidates.sort((a, b) => a.distanceMeters - b.distanceMeters || a.providerId.localeCompare(b.providerId))
    .filter((row) => {
      const count = counts.get(row.category) ?? 0;
      if (count >= maxPerCategory) return false;
      counts.set(row.category, count + 1);
      return true;
    }).slice(0, 8);
}
