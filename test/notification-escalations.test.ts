import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';

const env = vi.hoisted(() => ({
  serverEnv: {
    notifySmsEnabled: true, smsDeliveryEnabled: true, resendApiKey: '',
    guestContactSalt: 'synthetic-test-salt', cronSecret: 'synthetic-cron',
  },
  auth: { accountSid: 'ACsynthetic', authHeader: 'synthetic-auth', fromNumber: '+15005550006', mode: 'api_key' },
}));
vi.mock('@/lib/env', () => ({
  serverEnv: env.serverEnv, publicEnv: { appUrl: 'https://example.test' },
  resolveTwilioAuth: () => env.auth, isProductionRuntime: () => true,
}));
vi.mock('@/lib/billing/entitlements', () => ({ getEntitlements: async () => ({ smsEscalation: true }) }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => messagingDb({}) }));
import { runDueEscalations } from '@/lib/notifications/escalation-runner';
import { quietHoursResumeAt } from '@/lib/notifications/quiet-hours';
import { GET } from '@/app/api/cron/notification-escalations/route';

const NOTIF = '90000000-0000-4000-8000-0000000000aa';
const STEP = '91000000-0000-4000-8000-0000000000aa';
const NOON_ET = new Date('2026-10-01T16:00:00Z');
const link = `/dashboard/properties/${ids.property}/stays/${ids.stay}/conversations/${ids.conversation}`;

function seed(o: { notification?: Record<string, unknown>; step?: Record<string, unknown> } = {}) {
  const s: any = messagingSeed();
  s.properties[0].timezone = 'America/New_York';
  s.notifications = [{
    id: NOTIF, host_account_id: ids.account, kind: 'host_message', link, property_id: ids.property,
    recipient_profile_id: null, conversation_id: ids.conversation, urgency: null, acknowledged_at: null,
    created_at: '2026-10-01T15:45:00Z', ...o.notification,
  }];
  s.notification_escalations = [{ id: STEP, notification_id: NOTIF, step: 'sms_15m', status: 'pending', due_at: '2026-10-01T16:00:00Z', ...o.step }];
  s.notification_deliveries = [];
  return s;
}

const body = (call = 0) => new URLSearchParams(vi.mocked(fetch).mock.calls[call][1]?.body as string);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ sid: 'SMreminder', status: 'queued' }), { status: 201 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('reminder ladder runner', () => {
  it('sends the 15-minute reminder through the tracked link and records attempt 2', async () => {
    const db = messagingDb(seed());
    const summary = await runDueEscalations(db as never, NOON_ET);
    expect(summary).toMatchObject({ due: 1, sent: 1, cancelled: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body().get('Body')).toContain('reminder');
    expect(body().get('Body')).toContain(`https://example.test/api/notifications/${NOTIF}/open`);
    expect(db.rows.notification_escalations[0].status).toBe('done');
    expect(db.rows.notification_deliveries[0]).toMatchObject({ channel: 'sms', attempt: 2, provider_ref: 'SMreminder', recipient_profile_id: ids.owner });
  });

  it('cancels the step when the alert was already seen', async () => {
    const db = messagingDb(seed({ notification: { acknowledged_at: '2026-10-01T15:50:00Z' } }));
    await runDueEscalations(db as never, NOON_ET);
    expect(fetch).not.toHaveBeenCalled();
    expect(db.rows.notification_escalations[0].status).toBe('cancelled');
  });

  it('drops stale steps instead of texting late', async () => {
    const db = messagingDb(seed({ step: { due_at: '2026-10-01T13:00:00Z' } }));
    await runDueEscalations(db as never, NOON_ET);
    expect(fetch).not.toHaveBeenCalled();
    expect(db.rows.notification_escalations[0].status).toBe('cancelled');
  });

  it('does not touch steps that are not due yet', async () => {
    const db = messagingDb(seed({ step: { due_at: '2026-10-01T16:05:00Z' } }));
    const summary = await runDueEscalations(db as never, NOON_ET);
    expect(summary.due).toBe(0);
    expect(db.rows.notification_escalations[0].status).toBe('pending');
  });

  it('holds non-urgent reminders until 8 AM during quiet hours', async () => {
    const db = messagingDb(seed({ step: { due_at: '2026-10-02T02:59:00Z' } }));
    const summary = await runDueEscalations(db as never, new Date('2026-10-02T03:00:00Z'));
    expect(summary.deferred).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(db.rows.notification_escalations[0]).toMatchObject({ status: 'pending', due_at: '2026-10-02T12:00:00.000Z' });
  });

  it('lets emergencies through quiet hours', async () => {
    const db = messagingDb(seed({ notification: { urgency: 'p1' }, step: { step: 'p1_repeat_5m', due_at: '2026-10-02T02:59:00Z' } }));
    await runDueEscalations(db as never, new Date('2026-10-02T03:00:00Z'));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body().get('Body')).toContain('URGENT');
  });

  it('escalates to a backup team member with the direct link, never back to the original recipient', async () => {
    const s = seed({ notification: { recipient_profile_id: ids.owner }, step: { step: 'backup_30m' } });
    s.profiles.push({ id: 'backup-profile', phone: '+15005550009', phone_verified_at: '2026-09-01T00:00:00Z', sms_opt_in: true, email: null });
    s.property_members = [{ property_id: ids.property, profile_id: 'backup-profile', can_reply_guests: true }];
    const db = messagingDb(s);
    await runDueEscalations(db as never, NOON_ET);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(body().get('To')).toBe('+15005550009');
    expect(body().get('Body')).toContain('(backup)');
    expect(body().get('Body')).toContain(`https://example.test${link}`);
    expect(db.rows.notification_deliveries[0]).toMatchObject({ attempt: 3, recipient_profile_id: 'backup-profile' });
  });

  it('does not escalate account-wide alerts (every member was already alerted)', async () => {
    const db = messagingDb(seed({ step: { step: 'backup_30m' } }));
    await runDueEscalations(db as never, NOON_ET);
    expect(fetch).not.toHaveBeenCalled();
    expect(db.rows.notification_escalations[0].status).toBe('done');
  });

  it('never runs a claimed step twice', async () => {
    const db = messagingDb(seed());
    await runDueEscalations(db as never, NOON_ET);
    await runDueEscalations(db as never, NOON_ET);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('respects STOP for reminders too', async () => {
    const { hashContact } = await import('@/lib/crypto');
    const s = seed();
    s.sms_suppressions = [{ phone_hash: hashContact(s.profiles[0].phone).contactHash }];
    const db = messagingDb(s);
    await runDueEscalations(db as never, NOON_ET);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('cron route', () => {
  const req = (auth?: string) => new Request('https://example.test/api/cron/notification-escalations', auth ? { headers: { authorization: auth } } : {});

  it('returns 404 without the shared secret', async () => {
    expect((await GET(req())).status).toBe(404);
    expect((await GET(req('Bearer wrong'))).status).toBe(404);
  });

  it('runs with the shared secret', async () => {
    const res = await GET(req('Bearer synthetic-cron'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, due: 0 });
  });
});

describe('quietHoursResumeAt', () => {
  it('holds until 8 AM local during quiet hours', () => {
    expect(quietHoursResumeAt('America/New_York', new Date('2026-10-02T03:00:00Z'))?.toISOString()).toBe('2026-10-02T12:00:00.000Z');
    expect(quietHoursResumeAt('America/New_York', new Date('2026-10-01T11:30:00Z'))?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('does not hold outside quiet hours or for unknown time zones', () => {
    expect(quietHoursResumeAt('America/New_York', NOON_ET)).toBeNull();
    expect(quietHoursResumeAt(null, new Date('2026-10-02T03:00:00Z'))).toBeNull();
    expect(quietHoursResumeAt('Not/AZone', new Date('2026-10-02T03:00:00Z'))).toBeNull();
  });
});
