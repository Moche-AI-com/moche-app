import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestCodeConfirmSchema } from '@/lib/validation';
import { hashSessionToken, verifyVisitCode } from '@/lib/crypto';
import { guestSessionCookieOptions } from '@/lib/guest/session';
import { createStaySessionFromLink } from '@/lib/guest/stay-session';
import { checkRateLimit } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';
import { audit } from '@/lib/audit';
import { VISIT_CODE_MAX_ATTEMPTS, VISIT_CODE_CONFIRM_MAX_PER_IP_PER_HOUR, VISIT_CODE_GRACE_PERIOD_HOURS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Never reveal whether a link, code, or lockout state exists. All failures share this.
const GENERIC_FAIL = { error: 'That code is invalid or has expired.' };

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestCodeConfirmSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  const { token, code } = parsed.data;

  const admin = createAdminClient();
  const ip = clientIp(req);

  // Per-IP cap, independent of the per-code attempt cap below.
  const ipLimit = await checkRateLimit(admin, {
    key: ip,
    limit: VISIT_CODE_CONFIRM_MAX_PER_IP_PER_HOUR,
    windowSeconds: 60 * 60,
    action: 'guest.code.confirm',
  });
  if (!ipLimit.allowed) return NextResponse.json(GENERIC_FAIL, { status: 429 });

  const { data: property } = await admin
    .from('properties')
    .select('id, status, host_account_id')
    .eq('slug', params.slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!property || property.status !== 'live') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const tokenHash = hashSessionToken(token);
  const { data: link } = await admin
    .from('guest_access_links')
    .select(
      'id, property_id, stay_id, kind, expires_at, consumed_at, max_redemptions, redemption_count, revoked_at, code_hash, code_expires_at, code_revoked_at, code_first_used_at, code_attempt_count'
    )
    .eq('property_id', property.id)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!link || link.kind !== 'stay' || !link.stay_id || !link.code_hash) {
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }
  if (link.revoked_at || link.code_revoked_at) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (link.code_expires_at && new Date(link.code_expires_at) < new Date()) {
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }
  if (link.code_attempt_count >= VISIT_CODE_MAX_ATTEMPTS) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const valid = verifyVisitCode(code, link.id, link.code_hash);
  if (!valid) {
    const nextAttempts = link.code_attempt_count + 1;
    const lockedOut = nextAttempts >= VISIT_CODE_MAX_ATTEMPTS;
    await admin
      .from('guest_access_links')
      .update({
        code_attempt_count: nextAttempts,
        ...(lockedOut ? { code_revoked_at: new Date().toISOString() } : {}),
      } as never)
      .eq('id', link.id);

    if (lockedOut) {
      await audit(admin, {
        action: 'guest_link.code_locked',
        actorType: 'guest',
        hostAccountId: property.host_account_id,
        propertyId: property.id,
        targetType: 'guest_access_link',
        targetId: link.id,
      });
      await notify(admin, {
        hostAccountId: property.host_account_id,
        kind: 'system',
        title: 'A guest access code was locked after repeated failed attempts',
        body: `A guest exceeded ${VISIT_CODE_MAX_ATTEMPTS} failed code attempts on a stay link. The code has been automatically revoked — regenerate it from the stay's dashboard to restore access.`,
        propertyId: property.id,
      });
    }
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }

  const { data: stay } = await admin
    .from('stays').select('id, check_out, status, deleted_at').eq('id', link.stay_id).maybeSingle();
  if (!stay || stay.deleted_at || stay.status === 'revoked') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const expiresAt = new Date(new Date(stay.check_out).getTime() + VISIT_CODE_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  const created = await createStaySessionFromLink(admin, { propertyId: property.id, link, req, ip, expiresAt });
  if (!created) {
    return NextResponse.json({ error: 'Could not start your session. Please try again.' }, { status: 500 });
  }

  if (!link.code_first_used_at) {
    await admin.from('guest_access_links').update({ code_first_used_at: new Date().toISOString() } as never).eq('id', link.id);
  }
  await audit(admin, {
    action: 'guest_link.code_verified',
    actorType: 'guest',
    hostAccountId: property.host_account_id,
    propertyId: property.id,
    targetType: 'guest_access_link',
    targetId: link.id,
  });

  cookies().set({ ...guestSessionCookieOptions(created.expiresAt), value: created.sessionToken });

  return NextResponse.json({ ok: true });
}
