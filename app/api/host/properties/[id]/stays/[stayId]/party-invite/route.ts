import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess, type PropertyAccess } from '@/lib/auth/guards';
import { PARTY_INVITE_DEFAULT_MAX_JOINS, partyInviteCapUpdate } from '@/lib/guest/party-invite';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; stayId: string }> };
const NO_STORE = { 'Cache-Control': 'no-store' };
const LINK_COLS = 'id, created_at, expires_at, max_redemptions, redemption_count, consumed_at, revoked_at';
const spotsSchema = z.object({ maxRedemptions: z.number().int().min(1).max(30) });

// Host controls for a stay's guest party invites (guest-chat page → Guests on
// this stay → Group invite link).
//   GET    status of recent links + property invite settings
//   PATCH  'Add spots' on the live (or full) link
//   DELETE revoke every live link for the stay
// Revoking stops new joins immediately; guests who already joined keep their
// sessions. Owner or a member who can reply to guests; every change is audited.
async function authorize(id: string): Promise<PropertyAccess | null> {
  const access = await requirePropertyAccess(id);
  return access.isOwner || access.can.replyGuests ? access : null;
}

function forbidden() {
  return NextResponse.json({ error: 'You do not have permission to manage guest invites.' }, { status: 403, headers: NO_STORE });
}

async function audit(db: any, access: PropertyAccess, stayId: string, action: string, metadata: Record<string, unknown>) {
  const user = await getUser();
  await db.from('audit_logs').insert({
    host_account_id: access.property.host_account_id,
    property_id: access.property.id,
    actor_profile_id: user?.id ?? null,
    actor_type: 'host',
    action,
    target_type: 'stay',
    target_id: stayId,
    metadata,
  });
}

export async function GET(_req: Request, { params }: Params) {
  const { id, stayId } = await params;
  const access = await authorize(id);
  if (!access) return forbidden();
  const db = createAdminClient() as any;
  const [links, settings, stay] = await Promise.all([
    db.from('guest_access_links').select(LINK_COLS)
      .eq('property_id', id).eq('stay_id', stayId).eq('source', 'guest_share')
      .order('created_at', { ascending: false }).limit(10),
    db.from('property_settings').select('guest_share_enabled, guest_share_max_joins').eq('property_id', id).maybeSingle(),
    db.from('stays').select('guest_count').eq('id', stayId).eq('property_id', id).maybeSingle(),
  ]);
  if (links.error || stay.error) return NextResponse.json({ error: 'Could not load invites.' }, { status: 503, headers: NO_STORE });
  if (!stay.data) return NextResponse.json({ error: 'Stay not found.' }, { status: 404, headers: NO_STORE });
  return NextResponse.json({
    invites: links.data ?? [],
    settings: {
      enabled: settings.data?.guest_share_enabled !== false,
      maxJoins: settings.data?.guest_share_max_joins ?? PARTY_INVITE_DEFAULT_MAX_JOINS,
    },
    guestCount: stay.data.guest_count ?? 1,
    canManageSettings: Boolean(access.isOwner || access.can.editProperty),
  }, { headers: NO_STORE });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id, stayId } = await params;
  const access = await authorize(id);
  if (!access) return forbidden();

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: 'Enter a number of spots.' }, { status: 400, headers: NO_STORE });
  }
  const parsed = spotsSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Spots must be a whole number from 1 to 30.' }, { status: 400, headers: NO_STORE });

  const db = createAdminClient() as any;
  const { data: link } = await db.from('guest_access_links').select(LINK_COLS)
    .eq('property_id', id).eq('stay_id', stayId).eq('source', 'guest_share').is('revoked_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!link) return NextResponse.json({ error: 'There is no active invite link for this stay.' }, { status: 404, headers: NO_STORE });
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This invite link has expired.' }, { status: 409, headers: NO_STORE });
  }

  const { max, full } = partyInviteCapUpdate(link.redemption_count, parsed.data.maxRedemptions);
  // Reopening a full link clears consumed_at; the unique live-invite index makes
  // this fail rather than create a second live link if one somehow exists.
  const { data: updated, error } = await db.from('guest_access_links')
    .update({ max_redemptions: max, consumed_at: full ? (link.consumed_at ?? new Date().toISOString()) : null })
    .eq('id', link.id).is('revoked_at', null)
    .select(LINK_COLS).maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: 'Could not update this link. Refresh and try again.' }, { status: 409, headers: NO_STORE });
  }
  await audit(db, access, stayId, 'stay.party_invite_spots_updated', { link_id: link.id, from: link.max_redemptions, to: max });
  return NextResponse.json({ invite: updated }, { headers: NO_STORE });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id, stayId } = await params;
  const access = await authorize(id);
  if (!access) return forbidden();
  const db = createAdminClient() as any;
  const { data: revoked, error } = await db.from('guest_access_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('property_id', id).eq('stay_id', stayId).eq('source', 'guest_share').is('revoked_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: 'Could not revoke the invite.' }, { status: 503, headers: NO_STORE });
  await audit(db, access, stayId, 'stay.party_invite_revoked', { link_ids: (revoked ?? []).map((r: { id: string }) => r.id) });
  return NextResponse.json({ revoked: (revoked ?? []).length }, { headers: NO_STORE });
}
