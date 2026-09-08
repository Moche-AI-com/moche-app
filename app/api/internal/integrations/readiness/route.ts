import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/guards';
import { getIntegrationReadiness } from '@/lib/integrations/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET() {
  // Platform founder/staff only, NOT a tenant owner/admin. No diagnostics before authorization.
  const ctx = await getSessionContext().catch(() => null);
  if (!ctx?.isFounder) return new NextResponse(null, { status: 404, headers });
  try {
    return NextResponse.json(await getIntegrationReadiness(), { headers });
  } catch {
    return NextResponse.json({ error: 'Readiness unavailable.' }, { status: 503, headers });
  }
}
