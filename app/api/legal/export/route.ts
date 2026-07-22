import { NextResponse } from 'next/server';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { buildExportBundle } from '@/lib/legal/data-rights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GDPR Art. 20 data portability. Returns a downloadable JSON bundle of the
// signed-in host's own data. Uses the RLS-scoped user client, so a caller can
// only ever export what they are allowed to read.
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const bundle = await buildExportBundle(createClient(), {
    userId: ctx.user.id,
    hostAccountId: ctx.account.id,
  });

  const filename = `moche-data-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
