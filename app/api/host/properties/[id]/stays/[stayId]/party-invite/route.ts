import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; stayId: string }> };

// Host view and kill switch for a stay's guest party invites. Revoking stops new
// joins immediately; guests who already joined keep their sessions and can be
// removed individually from StayGuestsManager. Revoking a full link also lets
// guests mint a fresh one at the current guest_share_max_joins.
async function authorize(id: string): Promise<boolean> {
  const access = await requirePropertyAccess(id);
  return Boolean(access.isOwner || access.can.replyGuests);
}

export async function GET(_req: Request, { params }: Params) {
  const { id, stayId } = await params;
  if (!(await authorize(id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient() as any;
  const { data, error } = await db.from('guest_access_links')
    .select('id, created_at, expires_at, max_redemptions, redemption_count, consumed_at, revoked_at')
    .eq('property_id', id).eq('stay_id', stayId).eq('source', 'guest_share')
    .order('created_at', { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: 'Could not load invites.' }, { status: 503 });
  return NextResponse.json({ invites: data ?? [] });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, stayId } = await params;
  if (!(await authorize(id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = await getUser();
  const db = createAdminClient() as any;
  const { data: revoked, error } = await db.from('guest_access_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('property_id', id).eq('stay_id', stayId).eq('source', 'guest_share').is('revoked_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: 'Could not revoke the invite.' }, { status: 503 });
  const { data: property } = await db.from('properties').select('host_account_id').eq('id', id).maybeSingle();
  await db.from('audit_logs').insert({
    host_account_id: property?.host_account_id ?? null,
    property_id: id,
    actor_profile_id: user?.id ?? null,
    actor_type: 'host',
    action: 'stay.party_invite_revoked',
    target_type: 'stay',
    target_id: stayId,
    metadata: { link_ids: (revoked ?? []).map((r: { id: string }) => r.id) },
  });
  return NextResponse.json({ revoked: (revoked ?? []).length });
}
