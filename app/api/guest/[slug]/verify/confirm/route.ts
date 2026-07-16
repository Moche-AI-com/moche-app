import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestVerifyConfirmSchema } from '@/lib/validation';
import { hashContact, hashIp, verifyOtp, generateSessionToken, hashSessionToken } from '@/lib/crypto';
import { guestSessionCookieOptions } from '@/lib/guest/session';
import { DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const parsed = guestVerifyConfirmSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.' }, { status: 400 });
  }
  const { contact, code } = parsed.data;
  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties').select('id, status').eq('slug', params.slug).is('deleted_at', null).maybeSingle();
  if (!property || property.status !== 'live') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const { contactHash } = hashContact(contact);

  // Find the most recent unconsumed, unexpired verification for this contact+property.
  const { data: v } = await admin
    .from('guest_verifications')
    .select('id, code_hash, expires_at, attempts, max_attempts, consumed_at, stay_id')
    .eq('property_id', property.id)
    .eq('contact_hash', contactHash)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (!v) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (new Date(v.expires_at) < new Date()) return NextResponse.json(GENERIC_FAIL, { status: 400 });
  if (v.attempts >= v.max_attempts) {
    await admin.from('guest_verifications').update({ consumed_at: new Date().toISOString() } as never).eq('id', v.id);
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }

  const valid = v.code_hash ? verifyOtp(code, contactHash, v.code_hash) : false;
  if (!valid) {
    await admin.from('guest_verifications').update({ attempts: v.attempts + 1 } as never).eq('id', v.id);
    return NextResponse.json(GENERIC_FAIL, { status: 400 });
  }
  if (!v.stay_id) return NextResponse.json(GENERIC_FAIL, { status: 400 });

  // Consume the code (single-use).
  await admin.from('guest_verifications').update({ consumed_at: new Date().toISOString() } as never).eq('id', v.id);

  // Load the stay to scope the session and set expiry to checkout + grace.
  const { data: stay } = await admin
    .from('stays').select('id, check_out, status, deleted_at').eq('id', v.stay_id).maybeSingle();
  if (!stay || stay.deleted_at || stay.status === 'revoked') return NextResponse.json(GENERIC_FAIL, { status: 400 });

  const expiresAt = new Date(new Date(stay.check_out).getTime() + DEFAULT_GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const ipHash = hashIp(clientIp(req));

  const { error: sessErr } = await admin.from('guest_access_sessions').insert({
    property_id: property.id,
    stay_id: stay.id,
    session_token_hash: tokenHash,
    status: 'verified',
    verified_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    ip_hash: ipHash,
    user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
  } as never);
  if (sessErr) {
    log.warn('guest_session_create_failed', { error: sessErr.message });
    return NextResponse.json({ error: 'Could not start your session. Please try again.' }, { status: 500 });
  }

  // Mark the stay active if within window.
  if (stay.status === 'upcoming') {
    await admin.from('stays').update({ status: 'active' } as never).eq('id', stay.id);
  }

  // Set the opaque httpOnly session cookie. Only the token hash is stored server-side.
  cookies().set({ ...guestSessionCookieOptions(expiresAt), value: token });

  return NextResponse.json({ ok: true });
}
