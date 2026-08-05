import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { hasMapbox, mapboxSearchPois } from '@/lib/local/mapbox';
import { mergeLocalPlaces, type CuratedRecInput, type DiscoveredPlaceInput } from '@/lib/local/merge';
import {
  LOCAL_SEARCH_MAX_RESULTS,
  isSearchableQuery,
  mergeRemoteResults,
  needsRemoteFallback,
  providerCategoryToLocal,
  searchLocalPlaces,
  type RemoteCandidate,
} from '@/lib/local/search';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

/**
 * Hybrid Local search (backlog P4-13).
 *
 * Local-first by construction: the property's own merged Local list is searched
 * in-process, and the map provider is called only when that returns fewer than
 * LOCAL_SEARCH_MIN_RESULTS matches. Every returned row carries its source, so the
 * host can tell an existing pick from a provider suggestion.
 *
 * Host-only and rate limited. No guest path reaches this route, and nothing here
 * writes to any table - the provider tier is display-only until a host chooses to
 * add a place through the existing managers.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const access = await getPropertyAccess(params.id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!access.isOwner && !access.can.editBrain) {
    return NextResponse.json({ error: 'You do not have permission.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter something to search for.' }, { status: 400 });
  }
  const query = parsed.data.q;

  if (!isSearchableQuery(query)) {
    return NextResponse.json({ results: [], source: 'local', usedFallback: false, query });
  }

  const admin = createAdminClient();
  const user = await getUser();

  // The provider tier costs money per call, so the limit is on searches per host
  // per property, generous enough for real typing-and-refining but not for a loop.
  const rate = await checkRateLimit(admin, {
    key: `local-search:${params.id}:${user?.id ?? 'anon'}`,
    limit: 60,
    windowSeconds: 300,
    action: 'local_search',
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many searches. Try again in a few minutes.' },
      { status: 429 },
    );
  }

  const [curatedRes, discoveredRes] = await Promise.all([
    admin
      .from('recommendations')
      .select('id, name, category, host_preference, approved, hidden, host_note, description, distance_note, priority_weight')
      .eq('property_id', params.id)
      .is('deleted_at', null)
      .order('priority_weight', { ascending: false }),
    admin
      .from('nearby_places')
      .select('id, name, category, host_notes, host_starred, hidden, rating, distance_m')
      .eq('property_id', params.id),
  ]);

  const merged = mergeLocalPlaces(
    (curatedRes.data ?? []) as CuratedRecInput[],
    (discoveredRes.data ?? []) as DiscoveredPlaceInput[],
  );

  const local = searchLocalPlaces(query, merged, LOCAL_SEARCH_MAX_RESULTS);

  const property = access.property as typeof access.property & { lat: number | null; lng: number | null };
  const hasCoords = typeof property.lat === 'number' && typeof property.lng === 'number';
  const canFallback = needsRemoteFallback(local.length) && hasMapbox() && hasCoords;

  if (!canFallback) {
    return NextResponse.json({
      results: local,
      source: 'local',
      usedFallback: false,
      // Tells the UI why no provider suggestions appeared, so "nothing found" is
      // never silently ambiguous.
      fallbackSkipped: needsRemoteFallback(local.length)
        ? (!hasCoords ? 'no_coordinates' : 'provider_unavailable')
        : 'enough_local_matches',
      query,
    });
  }

  let remote: RemoteCandidate[] = [];
  try {
    const hits = await mapboxSearchPois({
      query,
      lat: property.lat as number,
      lng: property.lng as number,
      limit: 8,
    });
    remote = hits.map((h) => ({
      key: h.key,
      name: h.name,
      category: providerCategoryToLocal(h.providerCategory),
      address: h.address,
      distanceMeters: h.distanceMeters,
    }));
  } catch (e) {
    // A provider outage degrades to local-only results rather than an error page.
    log.warn('local_search_fallback_error', { error: String(e) });
  }

  const results = mergeRemoteResults(query, local, remote, LOCAL_SEARCH_MAX_RESULTS);

  return NextResponse.json({
    results,
    source: remote.length > 0 ? 'hybrid' : 'local',
    usedFallback: true,
    localMatchCount: local.length,
    query,
  });
}
