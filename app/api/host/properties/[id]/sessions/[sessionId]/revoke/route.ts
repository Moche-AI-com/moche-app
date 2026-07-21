import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Instant revoke: getGuestSession() rejects any row with revoked_at set on the next request.
export async function POST(_req: Request, { params }: { params: { id: string; sessionId: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('guest_access_sessions')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() } as never)
    .eq('id', params.sessionId)
    .eq('property_id', params.id);

  if (error) {
    log.warn('guest_session_revoke_failed', { error: error.message });
    return NextResponse.json({ error: 'Could not revoke the session.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
