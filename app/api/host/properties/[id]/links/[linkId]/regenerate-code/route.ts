import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { generateVisitCode, hashVisitCode } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { VISIT_CODE_GRACE_PERIOD_HOURS } from '@/lib/constants';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Overwrites the link row's code_hash in place — the URL/token is unchanged, only the
// code changes. The old code is implicitly dead once the row holds the new hash.
export async function POST(req: Request, { params }: { params: { id: string; linkId: string } }) {
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
  if (!link || link.kind !== 'stay' || !link.stay_id) {
    return NextResponse.json({ error: 'This link does not support an access code.' }, { status: 400 });
  }

  const { data: stay } = await admin.from('stays').select('check_out').eq('id', link.stay_id).maybeSingle();
  if (!stay) return NextResponse.json({ error: 'Stay not found.' }, { status: 404 });

  const code = generateVisitCode();
  const codeExpiresAt = new Date(new Date(stay.check_out).getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from('guest_access_links')
    .update({
      code_hash: hashVisitCode(code, link.id),
      code_expires_at: codeExpiresAt,
      code_revoked_at: null,
      code_attempt_count: 0,
      code_first_used_at: null,
    } as never)
    .eq('id', link.id);
  if (error) {
    log.warn('guest_link_code_regenerate_failed', { propertyId: property.id, linkId: link.id, error: error.message });
    return NextResponse.json({ error: 'Could not regenerate the code.' }, { status: 500 });
  }

  await audit(admin, {
    action: 'guest_link.code_issued',
    actorProfileId: user?.id ?? null,
    hostAccountId: property.host_account_id,
    propertyId: property.id,
    targetType: 'guest_access_link',
    targetId: link.id,
    metadata: { regenerated: true },
  });

  return NextResponse.json({ code });
}
