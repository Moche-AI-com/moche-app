import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/guards';
import { photonAutocomplete } from '@/lib/local/osm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server-side proxy for Photon address autocomplete. Keeps the descriptive
// User-Agent on the request and prevents the browser from hitting the public
// OSM endpoint directly. Host-only (requires a signed-in session).
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (q.trim().length < 3) return NextResponse.json({ suggestions: [] });

  const suggestions = await photonAutocomplete(q, 5);
  return NextResponse.json({ suggestions });
}
