import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { ids, messagingDb, messagingSeed, readyGuestRow } from './helpers/messaging-db';

const state = vi.hoisted(() => ({ db: null as any, cookie: '', session: null as any, allowed: true, secret: '' }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: async () => state.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock('@/lib/env', () => ({ serverEnv: { get guestContactSalt() { return state.secret; } } }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: state.allowed }) }));
vi.mock('@/lib/guest/translate', () => ({ translateForHost: async () => ({ translated: null }) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn(async () => ({ inApp: 'stored', sms: 'accepted' })) }));
import { POST as recover } from '@/app/api/guest/[slug]/host-chat/recover/route';
import { GET as readChat, POST as postChat } from '@/app/api/guest/[slug]/host-chat/route';
import { hashContact } from '@/lib/crypto';

const newSession = '30000000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ slug: 'synthetic-villa' }) };
const url = 'https://example.test/api/guest/synthetic-villa/host-chat';
const body = { conversationId: ids.conversation, messageId: ids.message, confirm: true };
const post = (data: any = body, origin = 'https://example.test') => new Request(`${url}/recover`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(data),
});
const get = () => readChat(new Request(`${url}?conversation=${ids.conversation}&message=${ids.message}`), params);
async function obtainGrant() {
  const result = await recover(post(), params);
  expect(result.status).toBe(200);
  state.cookie = result.cookies.get('moche_guest_conversation')!.value;
  return result;
}

beforeEach(() => {
  vi.useRealTimers();
  state.cookie = '';
  state.secret = 'synthetic-recovery-secret-not-a-real-key-0001';
  state.allowed = true;
  state.session = { sessionId: newSession, propertyId: ids.property, stayId: ids.stay, guestDisplayName: 'Synthetic new browser' };
  const seed: Record<string, any[]> = messagingSeed();
  seed.guest_access_sessions.push(readyGuestRow({
    id: newSession, guest_identity_id: 'independently-registered', phone_verified_at: new Date().toISOString(),
  }));
  seed.messages = [{ id: ids.message, conversation_id: ids.conversation, property_id: ids.property, role: 'host', content: 'Synthetic reply', created_at: new Date().toISOString() }];
  state.db = messagingDb(seed);
});

describe('explicit phone-proven conversation recovery', () => {
  it('locators alone reveal no messages, even with same phone and stay', async () => {
    const result = await get();
    expect(result.status).toBe(404);
    expect(await result.json()).toMatchObject({ code: 'RECOVERY_REQUIRED', recoveryReady: true });
    expect(state.db.writes).toHaveLength(0);
  });
  it('grants only the exact conversation, without transferring session or escalation ownership', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const result = await obtainGrant();
      expect(result.headers.get('set-cookie')).toMatch(/HttpOnly/);
      expect(result.headers.get('set-cookie')).toMatch(/Secure/);
      expect(result.headers.get('set-cookie')).toContain('/api/guest/synthetic-villa/host-chat');
      expect(await result.json()).toEqual({ ok: true, conversationId: ids.conversation, messageId: ids.message });
      expect(state.db.writes).toHaveLength(0);
      expect(state.db.rows.conversations[0].guest_session_id).toBe(ids.session);
      const read = await get();
      expect(read.status).toBe(200);
      expect(await read.json()).toMatchObject({ canSend: true, messages: [{ id: ids.message }] });
      const sent = await postChat(post({ message: 'Synthetic follow-up', conversationId: ids.conversation }), params);
      expect(sent.status).toBe(200);
      expect(state.db.rows.messages.at(-1).conversation_id).toBe(ids.conversation);
    } finally { vi.unstubAllEnvs(); }
  });
  it.each([
    { phone_verified_at: null },
    { phone_verified_at: '2020-01-01T00:00:00Z' },
    { phone_verified_at: '2099-01-01T00:00:00Z' },
    { phone_verified_at: 'invalid' },
    { notification_consent: false },
    { terms_accepted_at: null },
    { registered_at: null },
    { revoked_at: '2026-01-01' },
    { expires_at: '2020-01-01' },
    { guest_contact: '+15005550001' },
  ])('denies ineligible independently registered current session %j', async (patch) => {
    Object.assign(state.db.rows.guest_access_sessions[1], patch);
    const result = await recover(post(), params);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(state.db.writes).toHaveLength(0);
  });
  it.each([
    { phone_verified_at: null }, { guest_contact: '+15005550001' },
    { notification_consent: false }, { sms_opted_out_at: '2026-01-01' },
    { revoked_at: '2026-01-01' }, { expires_at: '2020-01-01' },
    { property_id: 'other-property' }, { stay_id: 'other-stay' },
  ])('never borrows an old participant phone, consent or shared stay proof %j', async (patch) => {
    Object.assign(state.db.rows.guest_access_sessions[0], patch);
    // Even a shared booking identity cannot authorize this recovery.
    state.db.rows.guest_access_sessions[1].guest_identity_id = state.db.rows.guest_access_sessions[0].guest_identity_id;
    const result = await recover(post(), params);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(state.db.writes).toHaveLength(0);
  });
  it.each([
    ['conversations', { property_id: 'other-property' }],
    ['conversations', { stay_id: 'other-stay' }],
    ['conversations', { channel: 'ai_chat' }],
    ['messages', { conversation_id: 'other-conversation' }],
    ['messages', { property_id: 'other-property' }],
    ['stays', { status: 'revoked' }],
    ['stays', { check_out: '2020-01-01' }],
  ])('validates target and stay scope before granting %s %j', async (table, patch) => {
    Object.assign(state.db.rows[table as string][0], patch);
    const result = await recover(post(), params);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(state.db.writes).toHaveLength(0);
  });
  it('requires explicit action and same origin, not a GET or a guessed target', async () => {
    expect((await recover(post({ ...body, confirm: false }), params)).status).toBe(400);
    expect((await recover(post(body, 'https://other.example.test'), params)).status).toBe(403);
    expect(state.db.writes).toHaveLength(0);
  });
  it('fails closed for suppression, missing session and rate limits', async () => {
    state.db.rows.sms_suppressions.push({ phone_hash: hashContact('+15005550006').contactHash });
    expect((await recover(post(), params)).status).toBe(403);
    state.db.rows.sms_suppressions = [];
    state.allowed = false;
    expect((await recover(post(), params)).status).toBe(429);
    state.session = null;
    expect((await recover(post(), params)).status).toBe(401);
    expect(state.db.writes).toHaveLength(0);
  });
  it('does not accept a forged, expired or other-browser recovery cookie', async () => {
    await obtainGrant();
    const token = state.cookie;
    state.cookie = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;
    expect((await get()).status).toBe(404);
    state.cookie = token;
    state.session.sessionId = '30000000-0000-4000-8000-000000000003';
    expect((await get()).status).toBe(404);
    state.session.sessionId = newSession;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61 * 60_000);
    expect((await get()).status).toBe(404);
    vi.useRealTimers();
  });
  it.each([
    [0, { notification_consent: false }], [1, { notification_consent: false }],
    [0, { revoked_at: '2026-01-01' }], [1, { guest_contact: '+15005550001' }],
    [1, { phone_verified_at: '2026-01-01T00:00:00Z' }],
  ])('revalidates both participants on every recovered read/write %s %j', async (index, patch) => {
    await obtainGrant();
    Object.assign(state.db.rows.guest_access_sessions[index as number], patch);
    expect((await get()).status).toBe(404);
    const result = await postChat(post({ message: 'Must not write', conversationId: ids.conversation }), params);
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(state.db.writes).toHaveLength(0);
  });
  it('scope cannot be expanded to a sibling conversation or different participant escalation', async () => {
    await obtainGrant();
    const sibling = '40000000-0000-4000-8000-000000000002';
    state.db.rows.conversations.push({ ...state.db.rows.conversations[0], id: sibling });
    expect((await readChat(new Request(`${url}?conversation=${sibling}`), params)).status).toBe(404);
    state.db.rows.escalations = [{ id: ids.escalation, property_id: ids.property, stay_id: ids.stay, guest_session_id: newSession, status: 'open' }];
    const result = await postChat(post({ message: 'Must not write', conversationId: ids.conversation, escalationId: ids.escalation }), params);
    expect(result.status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });
  it('keeps the original participant escalation intact while accepting its recovered reply', async () => {
    await obtainGrant();
    state.db.rows.escalations = [{ id: ids.escalation, property_id: ids.property, stay_id: ids.stay, host_conversation_id: ids.conversation, guest_session_id: ids.session, status: 'answered' }];
    const response = await postChat(post({ message: 'Synthetic recovered escalation reply', conversationId: ids.conversation, escalationId: ids.escalation }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ messageStored: true, reopened: true, workflowWarnings: [] });
    expect(state.db.rows.escalations[0]).toMatchObject({ status: 'open', guest_session_id: ids.session });
  });
  it('revokes recovered access after a destination-wide STOP', async () => {
    await obtainGrant();
    state.db.rows.sms_suppressions.push({ phone_hash: hashContact('+15005550006').contactHash });
    expect((await get()).status).toBe(404);
    expect((await postChat(post({ message: 'Must not write', conversationId: ids.conversation }), params)).status).toBe(403);
    expect(state.db.writes).toHaveLength(0);
  });
  it.each(['', 'dev-salt-change-me', 'short', 'change-me-to-a-long-random-string', ' '.repeat(40)])('fails closed for issuing and reading grants with unsafe signing configuration %j', async (secret) => {
    await obtainGrant();
    state.secret = secret;
    // An attacker can compute this signature when the configured salt is public.
    const payload = state.cookie.split('.')[0];
    state.cookie = `${payload}.${createHmac('sha256', `${secret}:guest-conversation-recovery:v1`).update(payload).digest('hex')}`;
    expect((await get()).status).toBe(404);
    const result = await recover(post(), params);
    expect(result.status).toBe(503);
    expect(result.headers.get('set-cookie')).toBeNull();
    expect((await get()).status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });
});
