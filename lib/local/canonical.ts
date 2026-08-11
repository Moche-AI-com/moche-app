import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { rankPlacesForGuest, type RankedPlace } from './ranking';

export type LocalPlaceStatus = 'suggested' | 'approved' | 'hidden';

/** The shape consumed by the Local manager and guest-ranking utilities. */
export interface LocalPlaceRow extends RankedPlace {
  recommendationId: string;
  category: string;
  address: string | null;
  provider: string;
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
      places!inner(name, category, address, provider, last_refreshed_at)
    `)
    .eq('property_id', propertyId)
    .limit(100);

  if (error) throw error;
  return mapAndRankCanonicalPlaces((data ?? []) as unknown as CanonicalPlaceRow[], guestIntentTags);
}
