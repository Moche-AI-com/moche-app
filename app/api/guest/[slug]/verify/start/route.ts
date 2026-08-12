import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { guestVerifyStartSchema } from '@/lib/validation';
import { hashContact, generateOtp, hashOtp } from '@/lib/crypto';
import { verifyTurnstile } from '@/lib/guest/turnstile';
import { checkRateLimit } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';
import { OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS, VERIFY_MAX_PER_CONTACT_PER_HOUR, VERIFY_MAX_PER_IP_PER_HOUR } from '@/lib/constants';
import { log } from '@/lib/log';
import { notifyGuestOtp } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IMPORTANT: This endpoint returns an IDENTICAL response whether or not the contact
// matches a real booking. It never reveals booking existence. An OTP is only actually
// sent when a matching active stay exists, but the caller cannot distinguish the cases.
const GENERIC_OK = { ok: true, message: "If that contact matches a booking, we've sent a code." };

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestVerifyStartSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid contact.' }, { status: 400 });
  }
  const { contact, turnstileToken } = parsed.data;
  const ip = clientIp(req);

  // Bot protection (dev/preview skip aware, fail-safe in production).
  const human = await verifyTurnstile(turnstileToken, ip);
  if (!human) return NextResponse.json({ error: "Please verify you're not a robot." }, { status: 400 });

  const admin = createAdminClient();

  // Resolve the property by slug. Only LIVE properties expose a guest portal.
  const { data: property } = await admin
    .from('properties')
    .select('id, status')
    .eq('slug', (await params).slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!property || property.status !== 'live') {
    // Do not reveal whether the property exists; return generic OK.
    return NextResponse.json(GENERIC_OK);
  }

  const { contactHash } = hashContact(contact);
  const sinceIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // --- Rate limiting: per-contact (guest_verifications) and per-IP (shared helper). ---
  const { count: byContact } = await admin
    .from('guest_verifications').select('id', { count: 'exact', head: true })
    .eq('property_id', property.id).eq('contact_hash', contactHash).gte('created_at', sinceIso);
  if ((byContact ?? 0) >= VERIFY_MAX_PER_CONTACT_PER_HOUR) {
    log.warn('guest_verify_rate_contact', { propertyId: property.id });
    return NextResponse.json(GENERIC_OK); // still generic — no signal
  }
  // Per-IP cap via the Supabase-backed rate-limit helper (hashes the IP, records the attempt).
  const ipLimit = await checkRateLimit(admin, {
    key: ip,
    limit: VERIFY_MAX_PER_IP_PER_HOUR,
    windowSeconds: 60 * 60,
    action: 'guest.verify.start',
  });
  if (!ipLimit.allowed) {
    log.warn('guest_verify_rate_ip', {});
    return NextResponse.json(GENERIC_OK);
  }

  // Look for a matching active/upcoming stay. If none, return generic OK (no signal).
  const { data: stay } = await admin
    .from('stays')
    .select('id, check_out')
    .eq('property_id', property.id)
    .eq('contact_hash', contactHash)
    .in('status', ['upcoming', 'active'])
    .is('deleted_at', null)
    .order('check_in', { ascending: false })
    .maybeSingle();

  if (stay) {
    const code = generateOtp();
    const codeHash = hashOtp(code, contactHash);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    // Invalidate prior unconsumed codes for this contact+property.
    await admin.from('guest_verifications')
      .update({ consumed_at: new Date().toISOString() } as never)
      .eq('property_id', property.id).eq('contact_hash', contactHash).is('consumed_at', null);

    await admin.from('guest_verifications').insert({
      property_id: property.id,
      stay_id: stay.id,
      contact_hash: contactHash,
      code_hash: codeHash,
      expires_at: expiresAt,
      max_attempts: OTP_MAX_ATTEMPTS,
    } as never);

    // Deliver the code out-of-band. In dev fallback, this logs to server only (never to client).
    await notifyGuestOtp({ contact, code, devFallback: serverEnv.guestVerifyDevFallback });
  }

  return NextResponse.json(GENERIC_OK);
}
