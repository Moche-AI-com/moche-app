import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { hasMapbox, mapboxSearchPois } from '@/lib/local/mapbox';
import { loadCanonicalPlaces } from '@/lib/local/canonical';
import { validCoordinates } from '@/lib/local/validation';
import {
  LOCAL_SEARCH_MAX_RESULTS,
  isSearchableQuery,
  mergeRemoteResults,
  needsRemoteFallback,
  providerCategoryToLocal,
  searchCanonicalPlaces,
  type RemoteCandidate,
} from '@/lib/local/search';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
});

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
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
 * writes provider results to any table. Mapbox results are display-only; hosts
 * add independently entered details through the manual form.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getPropertyAccess((await params).id);
  if (!access) return json({ error: 'Not found.' }, 404);
  if (!access.isOwner && !access.can.editBrain) {
    return json({ error: 'You do not have permission.' }, 403);
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) {
    return json({ error: 'Enter something to search for.' }, 400);
  }
  const query = parsed.data.q;

  if (!isSearchableQuery(query)) {
    return json({ results: [], source: 'local', usedFallback: false, query });
  }

  const user = await getUser();
  if (!user) return json({ error: 'Please sign in again.' }, 401);
  const admin = createAdminClient();

  // The provider tier costs money per call, so the limit is on searches per host
  // per property, generous enough for real typing-and-refining but not for a loop.
  const rate = await checkRateLimit(admin, {
    key: `local-search:${(await params).id}:${user.id}`,
    limit: 60,
    windowSeconds: 300,
    action: 'local_search',
  });
  if (!rate.allowed) {
    return json({ error: 'Too many searches. Try again in a few minutes.' }, 429);
  }

  let local;
  try {
    const places = await loadCanonicalPlaces(admin, (await params).id, [], { includeHidden: true });
    local = searchCanonicalPlaces(query, places, LOCAL_SEARCH_MAX_RESULTS);
  } catch {
    return json({ error: 'Your saved places could not be loaded. Try again.' }, 503);
  }

  const property = access.property as typeof access.property & { lat: number | null; lng: number | null };
  const hasCoords = validCoordinates(property.lat, property.lng);
  const canFallback = needsRemoteFallback(local.length) && hasMapbox() && hasCoords;

  if (!canFallback) {
    return json({
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
  let providerFailed = false;
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
      lat: h.lat,
      lng: h.lng,
    }));
  } catch {
    // A provider outage degrades to local-only results rather than an error page.
    providerFailed = true;
    log.warn('local_search_fallback_error');
  }

  const results = mergeRemoteResults(query, local, remote, LOCAL_SEARCH_MAX_RESULTS);

  return json({
    results,
    source: remote.length > 0 ? 'hybrid' : 'local',
    usedFallback: true,
    providerFailed,
    localMatchCount: local.length,
    query,
  });
}
