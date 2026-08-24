import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { rankPlacesForGuest, type RankedPlace } from './ranking';
import {
  mergeLocalPlaces,
  type CuratedRecInput,
  type DiscoveredPlaceInput,
} from './merge';
import { log } from '@/lib/log';

export type LocalPlaceStatus = 'suggested' | 'approved' | 'hidden';

/** The shape consumed by the Local manager and guest-ranking utilities. */
export interface LocalPlaceRow extends RankedPlace {
  recommendationId: string;
  category: string;
  address: string | null;
  provider: string;
  // Contact/geo fields are optional: older canonical rows and all curated-only
  // rows may not carry them.
  website?: string | null;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface CanonicalPlaceRow {
  id: string;
  status: LocalPlaceStatus;
  host_note: string | null;
  tags: string[];
  intent_tags: string[];
  is_favorite: boolean;
  distance_miles: number | null;
  places: {
    name: string;
    category: string;
    address: string | null;
    provider: string;
    last_refreshed_at: string;
    website: string | null;
    phone: string | null;
    lat: number | null;
    lon: number | null;
  } | null;
}

export function mapCanonicalPlaceRow(row: CanonicalPlaceRow): LocalPlaceRow | null {
  if (!row.places) return null;
  return {
    recommendationId: row.id,
    name: row.places.name,
    category: row.places.category,
    address: row.places.address,
    status: row.status,
    hostNote: row.host_note,
    tags: row.tags ?? [],
    intentTags: row.intent_tags ?? [],
    isFavorite: row.is_favorite,
    distanceMiles: row.distance_miles,
    lastRefreshedAt: row.places.last_refreshed_at,
    provider: row.places.provider,
    website: row.places.website,
    phone: row.places.phone,
    lat: row.places.lat,
    lng: row.places.lon,
  };
}

export function mapAndRankCanonicalPlaces(
  rows: CanonicalPlaceRow[],
  guestIntentTags: readonly string[] = [],
): LocalPlaceRow[] {
  const mapped = rows
    .map(mapCanonicalPlaceRow)
    .filter((row): row is LocalPlaceRow => row !== null);
  return rankPlacesForGuest(mapped, guestIntentTags) as LocalPlaceRow[];
}

/** Fetch the canonical local set, ordered exactly as guest recommendations are. */
export async function loadCanonicalPlaces(
  admin: SupabaseClient<Database>,
  propertyId: string,
  guestIntentTags: readonly string[] = [],
): Promise<LocalPlaceRow[]> {
  const { data, error } = await admin
    .from('property_place_recommendations')
    .select(`
      id,
      status,
      host_note,
      tags,
      intent_tags,
      is_favorite,
      distance_miles,
      places!inner(name, category, address, provider, last_refreshed_at, website, phone, lat, lon)
    `)
    .eq('property_id', propertyId)
    .limit(100);

  if (error) throw error;
  return mapAndRankCanonicalPlaces((data ?? []) as unknown as CanonicalPlaceRow[], guestIntentTags);
}

// ---------------------------------------------------------------------------
// Guest Local Guide (/g/[slug]/local)
// ---------------------------------------------------------------------------

/**
 * The guest-facing place shape: everything the Local Guide card renders,
 * including contact/geo fields the concierge prompt never needed (website,
 * phone, coordinates for directions links).
 */
export interface GuestLocalPlace {
  id: string;
  name: string;
  category: string;
  address: string | null;
  website: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  distanceMiles: number | null;
  /** Human distance phrasing from a curated row ("about a 10 min drive"). */
  distanceNote: string | null;
  hostNote: string | null;
  isFavorite: boolean;
  rating: number | null;
  /** The host's guest-facing description (curated rows only). */
  detail: string | null;
}

type NearbyContactRow = DiscoveredPlaceInput & {
  address: string | null;
  url: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Load the guest-visible local set for the portal's Local Guide page.
 *
 * Canonical places win when the property has them (only `approved`
 * relationships are guest-visible — that IS the publish gate). Properties not
 * yet migrated to canonical fall back to the legacy read: host-curated
 * `recommendations` merged with auto-discovered `nearby_places` by
 * lib/local/merge, with contact/geo fields re-attached from the discovered
 * source rows (curated rows never had them).
 */
export async function loadGuestLocalPlaces(
  admin: SupabaseClient<Database>,
  propertyId: string,
): Promise<GuestLocalPlace[]> {
  try {
    const canonical = await loadCanonicalPlaces(admin, propertyId);
    const visible = canonical.filter((p) => p.status === 'approved');
    if (visible.length > 0) {
      return visible.map((p) => ({
        id: p.recommendationId,
        name: p.name,
        category: p.category,
        address: p.address,
        website: p.website ?? null,
        phone: p.phone ?? null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        distanceMiles: p.distanceMiles,
        distanceNote: null,
        hostNote: p.hostNote,
        isFavorite: p.isFavorite,
        rating: null,
        detail: null,
      }));
    }
  } catch (error) {
    log.warn('guest_local.canonical_failed', {
      propertyId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const [discoveredRes, curatedRes] = await Promise.all([
    admin
      .from('nearby_places')
      .select('id, category, name, host_notes, host_starred, hidden, rating, distance_m, address, url, phone, lat, lng')
      .eq('property_id', propertyId)
      .eq('hidden', false)
      .order('host_starred', { ascending: false })
      .order('rating', { ascending: false, nullsFirst: false })
      .order('distance_m', { ascending: true })
      .limit(60),
    admin
      .from('recommendations')
      .select('id, name, category, host_preference, approved, hidden, host_note, description, distance_note, priority_weight')
      .eq('property_id', propertyId)
      .eq('approved', true)
      .eq('hidden', false)
      .is('deleted_at', null)
      .order('priority_weight', { ascending: false })
      .order('name', { ascending: true })
      .limit(60),
  ]);

  if (discoveredRes.error) log.warn('guest_local.discovered_failed', { propertyId, error: discoveredRes.error.message });
  if (curatedRes.error) log.warn('guest_local.curated_failed', { propertyId, error: curatedRes.error.message });

  const discovered = (discoveredRes.data ?? []) as NearbyContactRow[];
  const curated = (curatedRes.data ?? []) as CuratedRecInput[];
  if (discovered.length === 0 && curated.length === 0) return [];

  const merged = mergeLocalPlaces(curated, discovered);
  const discoveredById = new Map(discovered.map((row) => [row.id, row]));

  return merged.map((m) => {
    const source = discoveredById.get(m.id);
    return {
      id: m.id,
      name: m.name ?? 'Unnamed',
      category: m.category,
      address: source?.address ?? null,
      website: source?.url ?? null,
      phone: source?.phone ?? null,
      lat: source?.lat ?? null,
      lng: source?.lng ?? null,
      distanceMiles: m.distance_m != null ? m.distance_m / 1609.344 : null,
      distanceNote: m.distanceNote,
      hostNote: m.host_notes,
      isFavorite: m.host_starred,
      rating: m.rating,
      detail: m.detail,
    };
  });
}
