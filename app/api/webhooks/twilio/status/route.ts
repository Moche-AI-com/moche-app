import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv, serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { mapTwilioStatus } from '@/lib/notifications/delivery-status';
import { updateDeliveryByProviderRef } from '@/lib/notifications/deliveries';

// #195 PR 3: Twilio message status callback -> notification_deliveries.
// Same signature rules as /api/webhooks/twilio. Never logs phone numbers or bodies.

export const dynamic = 'force-dynamic';

const PATH = '/api/webhooks/twilio/status';
const denied = () => new Response('Forbidden', { status: 403 });
const ok = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  const token = serverEnv.twilioAuthToken;
  if (!token) return denied();

  let base: URL;
  try { base = new URL(publicEnv.appUrl); } catch { return denied(); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) return denied();

  let form: FormData;
  try { form = await req.formData(); } catch { return denied(); }
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === 'string') params[key] = value;

  const url = new URL(PATH, base).toString();
  const payload = url + Object.keys(params).sort().map((key) => key + params[key]).join('');
  const expected = Buffer.from(createHmac('sha1', token).update(payload).digest('base64'));
  const received = Buffer.from(req.headers.get('x-twilio-signature') ?? '');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return denied();
  if (params.AccountSid !== serverEnv.twilioAccountSid) return denied();

  const sid = params.MessageSid ?? params.SmsSid ?? '';
  if (!/^(SM|MM)[0-9a-f]{32}$/i.test(sid)) return ok();

  const mapped = mapTwilioStatus(params.MessageStatus ?? params.SmsStatus ?? '', params.ErrorCode ?? null);
  if (!mapped) return ok();

  const result = await updateDeliveryByProviderRef(createAdminClient(), sid, mapped.status, mapped.reason);
  log.info('twilio_status_callback', { status: mapped.status, result });
  if (result === 'error') return new Response('Retry', { status: 500 });
  return ok();
}
