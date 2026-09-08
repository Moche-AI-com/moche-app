import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv, serverEnv } from '@/lib/env';
import { hashContact } from '@/lib/crypto';
import { normalizeSmsPhone } from '@/lib/notifications/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const xml = () => new Response('<Response/>', { headers: { 'content-type': 'text/xml; charset=utf-8' } });

// Twilio signs the exact configured public URL plus all sorted form fields with
// the account Auth Token (NOT the outbound API-key secret). No host-header trust.
export async function POST(req: Request) {
  const denied = () => new Response('Invalid callback.', { status: 403 });
  if (!serverEnv.twilioAuthToken || !req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return denied();
  if (Number(req.headers.get('content-length') ?? 0) > 16384) return denied();
  const text = await req.text();
  if (text.length > 16384) return denied();
  const form = new URLSearchParams(text);
  const keys = Array.from(form.keys()).sort();
  if (new Set(keys).size !== keys.length) return denied();
  let base: URL;
  try { base = new URL(publicEnv.appUrl); } catch { return denied(); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return denied();
  const url = new URL('/api/webhooks/twilio', base).toString();
  const payload = url + keys.map((key) => key + form.get(key)).join('');
  const expected = Buffer.from(createHmac('sha1', serverEnv.twilioAuthToken).update(payload).digest('base64'));
  const received = Buffer.from(req.headers.get('x-twilio-signature') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return denied();
  if (form.get('AccountSid') !== serverEnv.twilioAccountSid || normalizeSmsPhone(form.get('To') ?? '') !== normalizeSmsPhone(serverEnv.twilioFromNumber)) return denied();
  const phone = normalizeSmsPhone(form.get('From') ?? '');
  if (!phone) return denied();
  const command = (form.get('OptOutType') || form.get('Body') || '').trim().toUpperCase();
  // A signed START proves only a carrier command, never this application's
  // per-person consent. Never clear application suppression/consent implicitly.
  if (!['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'].includes(command)) return xml();
  const db = createAdminClient() as any;
  const now = new Date().toISOString();
  const { error } = await db.from('sms_suppressions').upsert({
    phone_hash: hashContact(phone).contactHash, opted_out_at: now,
  }, { onConflict: 'phone_hash' });
  if (error) return new Response('Could not record preference.', { status: 500 });
  const [guests, hosts] = await Promise.all([
    db.from('guest_access_sessions').update({ notification_consent: false, notification_consent_at: null, sms_opted_out_at: now }).eq('guest_contact', phone),
    db.from('profiles').update({ sms_opt_in: false, sms_opt_in_at: null }).eq('phone', phone),
  ]);
  if (guests.error || hosts.error) return new Response('Could not record preference.', { status: 500 });
  return xml();
}
