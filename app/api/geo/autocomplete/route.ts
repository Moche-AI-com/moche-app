import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { geoAutocomplete } from '@/lib/local/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-host cap. Autocomplete is debounced client-side, so a normal host types a
// handful of queries per address; 120/5min is generous while stopping a runaway
// loop or a scripted client from burning the Mapbox quota.
const LIMIT = 120;
const WINDOW_SECONDS = 300;

// Server-side proxy for address autocomplete. Provider-aware: Mapbox when the
// server token is present, free Photon/OSM otherwise (see lib/local/geo.ts).
// The geocoding token never leaves the server, and the endpoint is host-only
// (requires a signed-in session) so it can't be used as an open geocoder.
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  if (q.trim().length < 3) return NextResponse.json({ suggestions: [] });

  const gate = await checkRateLimit(createAdminClient(), {
    key: `geo_autocomplete:${user.id}`,
    limit: LIMIT,
    windowSeconds: WINDOW_SECONDS,
    action: 'geo.autocomplete',
  });
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'Too many address lookups. Try again in a few minutes.', suggestions: [] },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } },
    );
  }

  // Optional bias params from the form (country + nearby coordinates) so
  // suggestions favour the region the host is actually working in.
  const country = url.searchParams.get('country')?.trim() || undefined;
  const nearLat = Number(url.searchParams.get('lat'));
  const nearLng = Number(url.searchParams.get('lng'));
  const proximity = Number.isFinite(nearLat) && Number.isFinite(nearLng)
    ? { lat: nearLat, lng: nearLng }
    : undefined;

  const { suggestions, provider } = await geoAutocomplete(q, 5, {
    countryCode: country && country.length === 2 ? country : undefined,
    proximity,
  });

  return NextResponse.json({ suggestions, provider });
}
