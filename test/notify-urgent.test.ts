import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';

const env = vi.hoisted(() => ({
  serverEnv: { notifySmsEnabled: true, smsDeliveryEnabled: true, resendApiKey: '', guestContactSalt: 'synthetic-test-salt' },
  auth: { accountSid: 'ACsynthetic', authHeader: 'synthetic-auth', fromNumber: '+15005550006', mode: 'api_key' },
}));
vi.mock('@/lib/env', () => ({
  serverEnv: env.serverEnv, publicEnv: { appUrl: 'https://example.test' },
  resolveTwilioAuth: () => env.auth, isProductionRuntime: () => true,
}));
vi.mock('@/lib/billing/entitlements', () => ({ getEntitlements: async () => ({ smsEscalation: true }) }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => messagingDb({ sms_suppressions: [] }) }));
import { notify } from '@/lib/notify';

const link = `/dashboard/properties/${ids.property}/stays/${ids.stay}/conversations/${ids.conversation}`;
const base = { hostAccountId: ids.account, propertyId: ids.property, kind: 'host_message' as const, title: 'New guest message', link };
const body = (call: number) => new URLSearchParams(vi.mocked(fetch).mock.calls[call][1]?.body as string).get('Body') ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ sid: 'SMsynthetic', status: 'queued' }), { status: 201 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('P1 host alerts (#195 launch)', () => {
  it('says URGENT and is not held back by a recent text in the same conversation', async () => {
    const db = messagingDb(messagingSeed());
    await notify(db as never, base);
    await notify(db as never, { ...base, urgency: 'p1' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(body(0)).toContain('You have a new guest message.');
    expect(body(1)).toContain('URGENT');
    expect(body(1)).toContain('Reply STOP to opt out.');
  });

  it('stores the urgency on the alert so the P1 reminder ladder is scheduled', async () => {
    const db = messagingDb(messagingSeed());
    await notify(db as never, { ...base, urgency: 'p1' });
    expect(db.rows.notifications[0].urgency).toBe('p1');
  });
});
