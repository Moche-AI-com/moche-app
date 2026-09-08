import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { getGuestMessagingReadiness, normalizeSmsPhone } from '@/lib/guest/messaging-readiness';
import { generateOtp, hashContact, hashOtp, verifyOtp } from '@/lib/crypto';
import { isSmsSuppressed } from '@/lib/notifications/sms-suppression';
import { notifyGuestOtp } from '@/lib/notify';
import { checkRateLimit } from '@/lib/rate-limit';
import { serverEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), phone: z.string().max(40), consent: z.literal(true), termsAccepted: z.literal(true) }),
  z.object({ action: z.literal('confirm'), phone: z.string().max(40), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal('opt_out') }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your phone and explicitly accept SMS and terms.' }, { status: 400 });
  const admin = createAdminClient();
  const db = admin as any;
  const { data: property } = await admin.from('properties').select('slug').eq('id', session.propertyId).maybeSingle();
  if (property?.slug !== (await params).slug) return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  const scopeUpdate = (values: Record<string, unknown>) => db.from('guest_access_sessions').update(values)
    .eq('id', session.sessionId).eq('property_id', session.propertyId).eq('stay_id', session.stayId).is('revoked_at', null);
  const { data: row, error: readError } = await db.from('guest_access_sessions').select('*')
    .eq('id', session.sessionId).eq('property_id', session.propertyId).eq('stay_id', session.stayId).maybeSingle();
  if (readError || !row?.registered_at) return NextResponse.json({ error: 'Register your name first. The AI concierge remains available without SMS.' }, { status: 403 });
  const now = new Date().toISOString();
  if (parsed.data.action === 'opt_out') {
    const { error } = await scopeUpdate({ notification_consent: false, notification_consent_at: null });
    return NextResponse.json(error ? { error: 'Could not save preference.' } : { ok: true, canSend: false }, { status: error ? 500 : 200 });
  }
  const phone = normalizeSmsPhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: 'Enter an international phone number, starting with + and country code.' }, { status: 400 });
  if (await isSmsSuppressed(admin, phone)) return NextResponse.json({ error: 'SMS is opted out or unavailable for this number. Use the AI concierge or contact your host another way.' }, { status: 403 });
  // Session + exact destination binding: a shared stay code or another party's
  // contact/OTP cannot verify this phone. Hashes never travel to the browser.
  const binding = hashOtp(session.sessionId, hashContact(phone).contactHash);
  const challenges = () => db.from('guest_verifications');
  if (parsed.data.action === 'start') {
    const { count, error: countError } = await challenges().select('id', { count: 'exact', head: true })
      .eq('contact_hash', binding).gte('created_at', new Date(Date.now() - 3600000).toISOString());
    const limit = await checkRateLimit(admin, { key: session.sessionId, limit: 5, windowSeconds: 3600, action: 'guest.phone.start' });
    const phoneLimit = await checkRateLimit(admin, { key: phone, limit: 5, windowSeconds: 3600, action: 'guest.phone.destination' });
    if (countError || (count ?? 0) >= 5 || !limit.allowed || !phoneLimit.allowed) return NextResponse.json({ error: 'Please wait before requesting another code.' }, { status: 429 });
    const { error: saveError } = await scopeUpdate({
      guest_contact: phone, guest_contact_type: 'phone', phone_verified_at: null,
      notification_consent: true, notification_consent_at: now, terms_accepted_at: now,
    });
    if (saveError) return NextResponse.json({ error: 'Could not save your preference.' }, { status: 500 });
    await challenges().update({ consumed_at: now }).eq('property_id', session.propertyId).eq('contact_hash', binding).is('consumed_at', null);
    const code = generateOtp();
    const { data: challenge, error } = await challenges().insert({
      property_id: session.propertyId, stay_id: session.stayId, contact_hash: binding, code_hash: hashOtp(code, binding),
      expires_at: new Date(Date.now() + 600000).toISOString(), attempts: 0, max_attempts: 5,
    }).select('id').single();
    if (error || !challenge) return NextResponse.json({ error: 'Could not prepare verification.' }, { status: 500 });
    try {
      await notifyGuestOtp({ contact: phone, code, devFallback: serverEnv.guestVerifyDevFallback });
      return NextResponse.json({ ok: true, sms: 'accepted', message: 'Verification SMS accepted by the provider. Enter the code if it arrives.' });
    } catch {
      // No automatic retry: an ambiguous provider timeout may already have sent.
      return NextResponse.json({ error: 'Could not confirm SMS acceptance. If a code arrives, you can still enter it. Otherwise wait before requesting another.', sms: 'unknown' }, { status: 503 });
    }
  }
  if (row.guest_contact !== phone || row.notification_consent !== true || !row.terms_accepted_at) return NextResponse.json({ error: 'Request a code for your own phone first.' }, { status: 400 });
  const { data: challenge } = await challenges().select('*').eq('property_id', session.propertyId).eq('stay_id', session.stayId)
    .eq('contact_hash', binding).is('consumed_at', null).gt('expires_at', now).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!challenge || challenge.attempts >= challenge.max_attempts) return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 400 });
  const valid = verifyOtp(parsed.data.code, binding, challenge.code_hash);
  // Claim an attempt atomically, including successful consumption.
  const { data: claimed, error: claimError } = await challenges().update({
    attempts: challenge.attempts + 1, ...(valid ? { consumed_at: now } : {}),
  }).eq('id', challenge.id).eq('attempts', challenge.attempts).is('consumed_at', null).gt('expires_at', now).select('id').maybeSingle();
  if (!valid || claimError || !claimed) return NextResponse.json({ error: 'Code is invalid or expired.' }, { status: 400 });
  const { data: saved, error } = await scopeUpdate({ phone_verified_at: now }).eq('guest_contact', phone)
    .eq('notification_consent', true).select('id').maybeSingle();
  if (error || !saved) return NextResponse.json({ error: 'Could not save phone verification. Please reconnect your phone.' }, { status: 500 });
  const readiness = await getGuestMessagingReadiness(admin, session);
  return NextResponse.json({ ok: true, canSend: readiness.ready });
}
