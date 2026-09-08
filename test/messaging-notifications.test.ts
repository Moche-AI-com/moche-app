import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';

const env = vi.hoisted(() => ({
  production: true,
  serverEnv: { notifySmsEnabled: true, smsDeliveryEnabled: true, resendApiKey: '', guestContactSalt: 'synthetic-test-salt' },
  auth: { accountSid: 'ACsynthetic', authHeader: 'synthetic-auth', fromNumber: '+15005550006', mode: 'api_key' },
}));
vi.mock('@/lib/env', () => ({
  serverEnv: env.serverEnv, publicEnv: { appUrl: 'https://example.test' },
  resolveTwilioAuth: () => env.auth, isProductionRuntime: () => env.production,
}));
vi.mock('@/lib/billing/entitlements', () => ({ getEntitlements: async () => ({ smsEscalation: true }) }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => messagingDb({ sms_suppressions: [] }) }));
import { notify, notifyGuestReply, notifyGuestConversationReply, sendHostOtp } from '@/lib/notify';
import { hashContact } from '@/lib/crypto';
import { log } from '@/lib/log';

beforeEach(() => {
  env.production = true;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'SMsynthetic', status: 'queued' }), { status: 201 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('SMS safety and acceptance semantics', () => {
  it('pings eligible host for a direct message with the exact message deep link', async () => {
    const link = `/dashboard/properties/${ids.property}/stays/${ids.stay}/conversations/${ids.conversation}?message=${ids.message}`;
    const result = await notify(messagingDb(messagingSeed()) as never, {
      hostAccountId: ids.account, propertyId: ids.property, kind: 'host_message',
      title: 'New guest message', link,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const payload = new URLSearchParams(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(payload.get('Body')).toContain(`https://example.test${link}`);
    expect(payload.get('Body')).not.toMatch(/token|Bearer|synthetic-auth/);
    expect(result).toMatchObject({ inApp: 'stored', sms: 'accepted' });
    expect(JSON.stringify(result)).not.toContain('delivered');
  });
  it('blocks all SMS in preview even with full production credentials', async () => {
    env.production = false;
    expect(await sendHostOtp('+15005550006', '123456')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns failure on Twilio rejection, not notification success', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 400 }));
    const result = await notifyGuestReply({ contact: '+15005550006', propertyName: 'Synthetic villa', portalUrl: `https://example.test/g/synthetic-villa?view=host&conversation=${ids.conversation}&message=${ids.message}` });
    expect(result).toMatchObject({ status: 'failed' });
  });
  it('times out safely and does not retry an ambiguous request', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('sensitive phone +15005550006 or body'));
    const result = await notifyGuestReply({ contact: '+15005550006', propertyName: 'Synthetic villa', portalUrl: 'https://example.test/g/synthetic-villa' });
    expect(result).toMatchObject({ status: 'unknown' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeDefined();
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain('+15005550006');
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain('sensitive');
  });
  it.each([
    ['missing phone', { phone: null }],
    ['invalid phone', { phone: 'not-a-phone' }],
    ['unverified phone', { phone_verified_at: null }],
    ['explicit opt-out', { sms_opt_in: false }],
  ])('never sends direct host SMS with %s, even for the always-on category', async (_name, patch) => {
    const seed: any = messagingSeed();
    Object.assign(seed.profiles[0], patch);
    const result = await notify(messagingDb(seed) as never, {
      hostAccountId: ids.account, propertyId: ids.property, kind: 'host_message', title: 'Message',
    });
    expect(result.sms).toBe('not_eligible');
    expect(result.smsAccepted).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('STOP suppression overrides a stored host opt-in and an always-on category', async () => {
    const seed: any = messagingSeed();
    seed.sms_suppressions = [{ phone_hash: hashContact(seed.profiles[0].phone).contactHash }];
    const result = await notify(messagingDb(seed) as never, {
      hostAccountId: ids.account, propertyId: ids.property, kind: 'host_message', title: 'Message',
    });
    expect(result.sms).toBe('not_eligible');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('checks returned durable notification errors before fanout', async () => {
    const result = await notify(messagingDb(messagingSeed(), { notifications: 'synthetic failure' }) as never, {
      hostAccountId: ids.account, kind: 'host_message', title: 'New message', propertyId: ids.property,
    });
    expect(result).toMatchObject({ inApp: 'failed', sms: 'not_attempted' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not fan out private property notifications to unassigned org members', async () => {
    const seed: any = messagingSeed();
    seed.organization_members = [{ profile_id: 'unassigned-profile' }];
    seed.profiles.push({ ...seed.profiles[0], id: 'unassigned-profile', phone: '+15005550007' });
    await notify(messagingDb(seed) as never, { hostAccountId: ids.account, propertyId: ids.property, kind: 'host_message', title: 'Message' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a targeted recipient outside the account/property', async () => {
    const seed: any = messagingSeed();
    seed.profiles.push({ ...seed.profiles[0], id: 'stranger' });
    await notify(messagingDb(seed) as never, {
      hostAccountId: ids.account, propertyId: ids.property, recipientProfileId: 'stranger', kind: 'host_message', title: 'Message',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('pings only the verified conversation participant with an exact guest message locator', async () => {
    const seed: any = messagingSeed();
    seed.messages = [{ id: ids.message, conversation_id: ids.conversation, property_id: ids.property, role: 'host' }];
    const result = await notifyGuestConversationReply(messagingDb(seed) as never, {
      propertyId: ids.property, stayId: ids.stay, conversationId: ids.conversation, messageId: ids.message, slug: 'synthetic-villa',
    });
    expect(result.status).toBe('accepted');
    const payload = new URLSearchParams(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(payload.get('To')).toBe(seed.guest_access_sessions[0].guest_contact);
    expect(payload.get('Body')).toContain(`https://example.test/g/synthetic-villa?view=host&conversation=${ids.conversation}&message=${ids.message}`);
  });
  it('will not borrow another participant or the host phone when the exact guest opted out', async () => {
    const seed: any = messagingSeed();
    seed.guest_access_sessions.push({ ...seed.guest_access_sessions[0], id: 'another-session' });
    seed.guest_access_sessions[0].notification_consent = false;
    seed.messages = [{ id: ids.message, conversation_id: ids.conversation, property_id: ids.property, role: 'host' }];
    expect((await notifyGuestConversationReply(messagingDb(seed) as never, {
      propertyId: ids.property, stayId: ids.stay, conversationId: ids.conversation, messageId: ids.message, slug: 'synthetic-villa',
    })).status).toBe('not_eligible');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not send a guest deep link to a message outside the authorized conversation', async () => {
    const seed: any = messagingSeed();
    seed.messages = [{ id: ids.message, conversation_id: 'another-conversation', property_id: ids.property, role: 'host' }];
    expect((await notifyGuestConversationReply(messagingDb(seed) as never, {
      propertyId: ids.property, stayId: ids.stay, conversationId: ids.conversation, messageId: ids.message, slug: 'synthetic-villa',
    })).status).toBe('not_eligible');
    expect(fetch).not.toHaveBeenCalled();
  });
});
