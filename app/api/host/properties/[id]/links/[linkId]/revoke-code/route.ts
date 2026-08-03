import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Manual host revoke. Fails closed everywhere: marks the code revoked AND kills any
// currently-live guest_access_sessions for the same stay (defense in depth — a guest
// mid-session loses access immediately, not just on their next redeem attempt).
export async function POST(_req: Request, { params }: { params: { id: string; linkId: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to manage this link.' }, { status: 403 });
  }
  const { property } = access;
  const admin = createAdminClient();
  const user = await getUser();

  const { data: link } = await admin
    .from('guest_access_links')
    .select('id, stay_id, kind, code_hash')
    .eq('id', params.linkId)
    .eq('property_id', property.id)
    .maybeSingle();
  if (!link || link.kind !== 'stay' || !link.code_hash) {
    return NextResponse.json({ error: 'This link has no active code.' }, { status: 400 });
  }

  const { error } = await admin
    .from('guest_access_links')
    .update({ code_revoked_at: new Date().toISOString() } as never)
    .eq('id', link.id);
  if (error) {
    log.warn('guest_link_code_revoke_failed', { propertyId: property.id, linkId: link.id, error: error.message });
    return NextResponse.json({ error: 'Could not revoke the code.' }, { status: 500 });
  }

  if (link.stay_id) {
    await admin
      .from('guest_access_sessions')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() } as never)
      .eq('stay_id', link.stay_id)
      .eq('property_id', property.id);
  }

  await audit(admin, {
    action: 'guest_link.code_revoked',
    actorProfileId: user?.id ?? null,
    hostAccountId: property.host_account_id,
    propertyId: property.id,
    targetType: 'guest_access_link',
    targetId: link.id,
  });

  return NextResponse.json({ ok: true });
}
