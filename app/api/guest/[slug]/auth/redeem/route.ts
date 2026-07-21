import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestRedeemSchema } from '@/lib/validation';
import { hashSessionToken, generateSessionToken, hashIp } from '@/lib/crypto';
import { guestSessionCookieOptions } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { DEFAULT_GRACE_PERIOD_HOURS, LINK_REDEEM_MAX_PER_IP_PER_HOUR } from '@/lib/constants';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Never reveal whether a link, property, or booking exists. All failures share this.
const GENERIC_FAIL = { error: 'That link is invalid or has expired.' };

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
  const parsed = guestRedeemSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  const { token } = parsed.data;

  const admin = createAdminClient();
  const ip = clientIp(req);

  // Per-IP redemption cap (hashes the IP, records the attempt).
  const ipLimit = await checkRateLimit(admin, {
    key: ip,
    limit: LINK_REDEEM_MAX_PER_IP_PER_HOUR,
    windowSeconds: 60 * 60,
    action: 'guest.link.redeem',
  });
  if (!ipLimit.allowed) return NextResponse.json(GENERIC_FAIL, { status: 429 });

  // Only live properties expose access.
  const { data: property } = await admin
    .from('properties').select('id, status').eq('slug', params.slug).is('deleted_at', null).maybeSingle();
  if (!property || property.status !== 'live') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const tokenHash = hashSessionToken(token);
  const { data: link } = await admin
    .from('guest_access_links')
    .select('id, property_id, stay_id, kind, expires_at, consumed_at, max_redemptions, redemption_count, require_otp, revoked_at')
    .eq('property_id', property.id)
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!link) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (link.revoked_at) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (link.redemption_count >= link.max_redemptions) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (link.kind === 'stay' && link.consumed_at) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  // Property links (or any link requiring OTP) do NOT create a session here. The client
  // routes the guest into the existing OTP flow with the property already resolved.
  // redemption_count is only incremented on successful session creation.
  if (link.kind === 'property' || link.require_otp) {
    return NextResponse.json({ ok: true, requireOtp: true, propertyResolved: true });
  }

  // Stay link, no OTP: the host vouched by minting it. Mirror verify/confirm exactly.
  if (!link.stay_id) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  const { data: stay } = await admin
    .from('stays').select('id, check_out, status, deleted_at').eq('id', link.stay_id).maybeSingle();
  if (!stay || stay.deleted_at || stay.status === 'revoked') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const expiresAt = new Date(new Date(stay.check_out).getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const ipHash = hashIp(ip);

  const { error: sessErr } = await admin.from('guest_access_sessions').insert({
    property_id: property.id,
    stay_id: stay.id,
    session_token_hash: sessionTokenHash,
    status: 'verified',
    verified_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    ip_hash: ipHash,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
  } as never);
  if (sessErr) {
    log.warn('guest_link_session_create_failed', { error: sessErr.message });
    return NextResponse.json({ error: 'Could not start your session. Please try again.' }, { status: 500 });
  }

  // Mark the stay active if within window.
  if (stay.status === 'upcoming') {
    await admin.from('stays').update({ status: 'active' } as never).eq('id', stay.id);
  }

  // Count the redemption; consume the stay link if it has hit its cap.
  const nextCount = link.redemption_count + 1;
  await admin.from('guest_access_links').update({
    redemption_count: nextCount,
    ...(nextCount >= link.max_redemptions ? { consumed_at: new Date().toISOString() } : {}),
  } as never).eq('id', link.id);

  // Set the opaque httpOnly session cookie. Only the token hash is stored server-side.
  cookies().set({ ...guestSessionCookieOptions(expiresAt), value: sessionToken });

  return NextResponse.json({ ok: true });
}
