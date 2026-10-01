import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { hashSessionToken } from '@/lib/crypto';
import { derivePartyInviteToken, partyInviteCap, partyInviteExpiry } from '@/lib/guest/party-invite';
import { partyJoinUrl } from '@/lib/guest/party-invite-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LINK_COLS = 'id, expires_at, consumed_at, max_redemptions, redemption_count';

// 'Invite your group'. Returns the stay's single live party link, minting it on
// first use. Sends nothing: the guest shares through the native share sheet,
// copy link, or an sms: link, so there is no Twilio/Resend cost and no
// third-party consent exposure. Redemption goes through the existing
// /api/guest/[slug]/auth/redeem route (session, expiry, revoke, cap all reused).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const secret = process.env.GUEST_PARTY_INVITE_SECRET ?? '';
  if (secret.length < 32) {
    return NextResponse.json({ error: 'Group invites are not available right now.' }, { status: 503 });
  }

  const { slug } = await params;
  const admin = createAdminClient();
  // New columns land before `supabase gen types`; same opt-out convention as stay_share_invites.
  const db = admin as any;

  const { data: property } = await db.from('properties')
    .select('id, slug, display_name, host_account_id').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== slug) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const [{ data: stay }, { data: settings }] = await Promise.all([
    db.from('stays').select('id, status, check_out, guest_count, deleted_at')
      .eq('id', session.stayId).eq('property_id', property.id).maybeSingle(),
    db.from('property_settings').select('guest_share_enabled, guest_share_max_joins, grace_period_hours')
      .eq('property_id', property.id).maybeSingle(),
  ]);
  if (!stay || stay.deleted_at || !['upcoming', 'active'].includes(stay.status)) {
    return NextResponse.json({ error: 'This stay can no longer be shared.' }, { status: 409 });
  }
  if (settings?.guest_share_enabled === false) {
    return NextResponse.json({ error: 'Your host has turned off group invites.' }, { status: 403 });
  }
  const expiresAt = partyInviteExpiry(stay.check_out, settings?.grace_period_hours);
  if (expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This stay has ended.' }, { status: 409 });
  }

  const { data: existing } = await db.from('guest_access_links').select(LINK_COLS)
    .eq('stay_id', stay.id).eq('source', 'guest_share').is('revoked_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  // A full link stays full until the host revokes it or raises the cap; guests cannot mint around it.
  if (existing?.consumed_at) {
    return NextResponse.json({ error: 'Your group invite is full. Ask your host to add more spots.', full: true }, { status: 409 });
  }

  let link = existing;
  if (!link) {
    const id = crypto.randomUUID();
    const maxRedemptions = partyInviteCap(stay.guest_count, settings?.guest_share_max_joins);
    const { data: inserted, error } = await db.from('guest_access_links').insert({
      id,
      property_id: property.id,
      stay_id: stay.id,
      kind: 'stay',
      source: 'guest_share',
      token_hash: hashSessionToken(derivePartyInviteToken(id, secret)),
      expires_at: expiresAt.toISOString(),
      max_redemptions: maxRedemptions,
      require_otp: false,
      created_by_guest_session_id: session.sessionId,
    }).select(LINK_COLS).single();

    if (error) {
      // Lost a race with another guest on the same stay (unique live-invite index). Reuse theirs.
      const { data: raced } = await db.from('guest_access_links').select(LINK_COLS)
        .eq('stay_id', stay.id).eq('source', 'guest_share').is('revoked_at', null).is('consumed_at', null)
        .maybeSingle();
      if (!raced) return NextResponse.json({ error: 'Could not create an invite. Please try again.' }, { status: 503 });
      link = raced;
    } else {
      link = inserted;
      await db.from('audit_logs').insert({
        host_account_id: property.host_account_id,
        property_id: property.id,
        actor_type: 'guest',
        action: 'stay.party_invite_created',
        target_type: 'stay',
        target_id: stay.id,
        metadata: { link_id: id, max_redemptions: maxRedemptions, guest_session_id: session.sessionId },
      });
    }
  }

  return NextResponse.json({
    url: partyJoinUrl(new URL(req.url).origin, property.slug, derivePartyInviteToken(link.id, secret)),
    propertyName: property.display_name,
    checkOut: stay.check_out,
    expiresAt: link.expires_at,
    spotsLeft: Math.max(0, link.max_redemptions - link.redemption_count),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
