import { beforeEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: async () => ({
  sessionId: '30000000-0000-4000-8000-000000000001', propertyId: '10000000-0000-4000-8000-000000000001',
  stayId: '20000000-0000-4000-8000-000000000001',
}) }));
vi.mock('@/lib/notify', () => ({ notifyGuestOtp: vi.fn(async () => {}), sendHostOtp: vi.fn(async () => true) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/env', () => ({
  serverEnv: { guestContactSalt: 'synthetic-only', twilioAuthToken: 'synthetic-token', twilioAccountSid: 'ACsynthetic', twilioFromNumber: '+15005550006' },
  publicEnv: { appUrl: 'https://example.test' },
}));
import { POST as consentPost } from '@/app/api/guest/[slug]/notify-consent/route';
import { POST as registerPost } from '@/app/api/guest/[slug]/stay-guest/register/route';
import { POST as webhookPost } from '@/app/api/webhooks/twilio/route';
import { createAndSendHostOtp, verifyHostOtp } from '@/lib/auth/host-otp';
import { notifyGuestOtp } from '@/lib/notify';
import { hashContact } from '@/lib/crypto';
const params = { params: Promise.resolve({ slug: 'synthetic-villa' }) };
const request = (body: any) => new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { state.db = messagingDb(messagingSeed()); vi.clearAllMocks(); });

it('old consent-only request cannot assert phone verification', async () => {
  const response = await consentPost(request({ contact: '+15005550006', consent: true }), params);
  expect(response.status).toBe(400);
  expect(state.db.writes).toHaveLength(0);
});
it('registration keeps name-only concierge and records own terms without borrowing identity', async () => {
  state.db.rows.guest_identities = [{ id: 'another-person', property_id: ids.property, contact_hash: hashContact('+15005550006').contactHash }];
  const response = await registerPost(request({ firstName: 'Synthetic', lastName: 'Guest', termsAccepted: true }), params);
  expect(response.status).toBe(200);
  expect(state.db.rows.guest_access_sessions[0]).toMatchObject({ guest_contact: null, notification_consent: false, phone_verified_at: null });
  expect(state.db.rows.guest_access_sessions[0].terms_accepted_at).toBeTruthy();
  expect(state.db.rows.guest_access_sessions[0].guest_identity_id).not.toBe('another-person');
});
it('phone proof is single-use and bound to this session and exact phone', async () => {
  state.db.rows.guest_access_sessions[0].phone_verified_at = null;
  const start = await consentPost(request({ action: 'start', phone: '+15005550006', consent: true, termsAccepted: true }), params);
  expect(start.status).toBe(200);
  const code = vi.mocked(notifyGuestOtp).mock.calls[0][0].code;
  const wrong = await consentPost(request({ action: 'confirm', phone: '+15005550001', code }), params);
  expect(wrong.status).toBe(400);
  expect(state.db.rows.guest_access_sessions[0].phone_verified_at).toBeNull();
  const confirm = await consentPost(request({ action: 'confirm', phone: '+15005550006', code }), params);
  expect(confirm.status).toBe(200);
  expect(state.db.rows.guest_access_sessions[0].phone_verified_at).toBeTruthy();
  const replay = await consentPost(request({ action: 'confirm', phone: '+15005550006', code }), params);
  expect(replay.status).toBe(400);
});
it('host code cannot verify a different phone number', async () => {
  const { sendHostOtp } = await import('@/lib/notify');
  await createAndSendHostOtp(state.db, { userId: ids.owner, purpose: 'phone_verify', phone: '+15005550006' });
  const code = vi.mocked(sendHostOtp).mock.calls[0][1];
  expect(await verifyHostOtp(state.db, { userId: ids.owner, purpose: 'phone_verify', phone: '+15005550001', code })).toBe(false);
});

function webhook(body: Record<string, string>, valid = true) {
  const url = 'https://example.test/api/webhooks/twilio';
  const payload = url + Object.keys(body).sort().map((k) => k + body[k]).join('');
  const signature = createHmac('sha1', 'synthetic-token').update(payload).digest('base64');
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': valid ? signature : 'forged' }, body: new URLSearchParams(body) });
}
const stop = { AccountSid: 'ACsynthetic', From: '+15005550001', To: '+15005550006', Body: 'STOP' };
it('rejects forged opt-out webhooks without any writes', async () => {
  expect((await webhookPost(webhook(stop, false))).status).toBe(403);
  expect(state.db.writes).toHaveLength(0);
});
it('signed STOP suppresses destination with a hash; START never borrows consent', async () => {
  expect((await webhookPost(webhook(stop))).status).toBe(200);
  expect(state.db.rows.sms_suppressions[0].phone_hash).toBe(hashContact(stop.From).contactHash);
  expect(JSON.stringify(state.db.rows.sms_suppressions)).not.toContain(stop.From);
  const before = state.db.writes.length;
  expect((await webhookPost(webhook({ ...stop, Body: 'START' }))).status).toBe(200);
  expect(state.db.writes.length).toBe(before);
});
it('rejects a signed callback for a different account', async () => {
  expect((await webhookPost(webhook({ ...stop, AccountSid: 'ACother' }))).status).toBe(403);
  expect(state.db.writes).toHaveLength(0);
});
