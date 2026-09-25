import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { hasMapbox, mapboxSearchPois } from '@/lib/local/mapbox';
import { safePhone, safeWebsite, validCoordinates } from '@/lib/local/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
function reply(payload: object, status: number) {
  return NextResponse.json(payload, { status, headers });
}

/** Temporary provider results only. Never persist, cache, or call the provider before guest authorization. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (process.env.LOCAL_LIVE_MAPBOX_ENABLED !== 'true') return reply({ error: 'not_found' }, 404);
  const session = await getGuestSession();
  if (!session) return reply({ error: 'Verify your stay to explore nearby.' }, 401);
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: property, error } = await admin.from('properties')
    .select('id, slug, status, lat, lng')
    .eq('id', session.propertyId).eq('slug', slug).eq('status', 'live').is('deleted_at', null)
    .maybeSingle();
  if (error) return reply({ error: 'Nearby places are temporarily unavailable.' }, 503);
  if (!property || property.id !== session.propertyId || property.slug !== slug || property.status !== 'live')
    return reply({ error: 'not_found' }, 404);
  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 80) return reply({ error: 'Enter 2–80 characters to search.' }, 400);
  if (!validCoordinates(property.lat, property.lng) || !hasMapbox())
    return reply({ error: 'Nearby search is unavailable. Try the host guide.' }, 503);
  const limit = await checkRateLimit(admin, {
    key: `local-mapbox:${session.sessionId}`, action: 'guest_local_mapbox_search',
    limit: 8, windowSeconds: 60, failClosed: true,
  });
  if (!limit.allowed) return reply({ error: 'Search limit reached or search is temporarily unavailable.' }, 429);
  try {
    const hits = await mapboxSearchPois({ query: q, lat: property.lat!, lng: property.lng!, radiusMeters: 8000, limit: 6 });
    return reply({
      source: 'mapbox_live', ephemeral: true, hostEndorsed: false, checkedAt: new Date().toISOString(),
      places: hits.map((hit) => ({
        key: hit.key, name: hit.name, category: hit.providerCategory, address: hit.address,
        lat: hit.lat, lng: hit.lng, distanceMeters: hit.distanceMeters,
        websiteUrl: safeWebsite(hit.url), telHref: safePhone(hit.phone),
      })),
    }, 200);
  } catch {
    return reply({ error: 'Mapbox nearby search is temporarily unavailable.' }, 503);
  }
}
