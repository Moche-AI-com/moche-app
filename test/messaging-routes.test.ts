import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';

const state = vi.hoisted(() => ({ db: null as any, allowed: true }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
vi.mock('@/lib/guest/session', () => ({
  getGuestSession: async () => ({
    sessionId: '30000000-0000-4000-8000-000000000001', propertyId: '10000000-0000-4000-8000-000000000001',
    stayId: '20000000-0000-4000-8000-000000000001', guestDisplayName: 'Synthetic guest', checkOut: '2099-01-01',
  }),
}));
vi.mock('@/lib/auth/guards', () => ({
  getUser: async () => ({ id: '70000000-0000-4000-8000-000000000001' }),
  requirePropertyAccess: async () => ({
    isOwner: state.allowed, can: { replyGuests: state.allowed }, member: null,
    property: { id: '10000000-0000-4000-8000-000000000001', slug: 'synthetic-villa', display_name: 'Synthetic villa', host_account_id: '60000000-0000-4000-8000-000000000001' },
  }),
}));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/guest/translate', () => ({ translateForHost: async () => ({ translated: null }) }));
vi.mock('@/lib/brain/guest-answer-learning', () => ({ normalizeGuestAnswerForBrain: vi.fn() }));
vi.mock('@/lib/notify', () => ({
  notify: vi.fn(async () => ({ inApp: 'stored', sms: 'failed' })),
  notifyGuestReply: vi.fn(async () => ({ status: 'failed' })),
  notifyGuestConversationReply: vi.fn(async () => ({ status: 'failed' })),
}));
import { POST as guestPost } from '@/app/api/guest/[slug]/host-chat/route';
import { POST as hostPost } from '@/app/api/host/properties/[id]/guest-chats/[conversationId]/messages/route';
import { POST as manualPost } from '@/app/api/guest/[slug]/escalate/route';
import { POST as syncPost } from '@/app/api/guest/[slug]/host-chat/sync-escalation/route';

const guestParams = { params: Promise.resolve({ slug: 'synthetic-villa' }) };
const hostParams = { params: Promise.resolve({ id: ids.property, conversationId: ids.conversation }) };
const request = (body: any) => new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { state.db = messagingDb(messagingSeed()); state.allowed = true; });

describe('direct-message route boundaries before writes', () => {
  it.each([manualPost, syncPost])('legacy direct escalation entrypoints require own verified phone and consent', async (route) => {
    state.db.rows.guest_access_sessions[0].phone_verified_at = null;
    const result = await route(request({ message: 'Synthetic request', question: 'Synthetic request' }), guestParams);
    expect(result.status).toBe(403);
    expect(state.db.writes).toHaveLength(0);
  });
  it.each([{ guest_contact: null }, { phone_verified_at: null }, { notification_consent: false }, { terms_accepted_at: null }])('guest cannot send without readiness %j', async (patch) => {
    Object.assign(state.db.rows.guest_access_sessions[0], patch);
    const result = await guestPost(request({ message: 'Synthetic message' }), guestParams);
    expect(result.status).toBe(403);
    expect(state.db.writes.filter((w: any) => ['messages', 'conversations'].includes(w.table))).toHaveLength(0);
  });
  it('rejects host escalation from another stay before storing any message', async () => {
    state.db.rows.escalations = [{ id: ids.escalation, property_id: ids.property, stay_id: 'other-stay', host_conversation_id: 'other-thread' }];
    const result = await hostPost(request({ message: 'Synthetic reply', escalationId: ids.escalation }), hostParams);
    expect(result.status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });
  it('rejects host escalation from another property before storing any message', async () => {
    state.db.rows.escalations = [{ id: ids.escalation, property_id: 'other-property', stay_id: ids.stay }];
    const result = await hostPost(request({ message: 'Synthetic reply', escalationId: ids.escalation }), hostParams);
    expect(result.status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });
  it('rejects guest escalation belonging to another party member in the same stay', async () => {
    state.db.rows.escalations = [{ id: ids.escalation, property_id: ids.property, stay_id: ids.stay, guest_session_id: 'other-session', status: 'open' }];
    const result = await guestPost(request({ message: 'Synthetic message', escalationId: ids.escalation }), guestParams);
    expect(result.status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });
  it('rejects cross-stay extras mutations before host reply writes', async () => {
    state.db.rows.extras_orders = [{ id: ids.escalation, property_id: ids.property, stay_id: 'other-stay' }];
    const result = await hostPost(request({ message: 'Synthetic reply', extrasOrderId: ids.escalation }), hostParams);
    expect(result.status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });
  it('denies unassigned host capability', async () => {
    state.allowed = false;
    const result = await hostPost(request({ message: 'Synthetic reply' }), hostParams);
    expect(result.status).toBe(403);
    expect(state.db.writes).toHaveLength(0);
  });
  it('reports a stored guest message separately from failed host SMS', async () => {
    const result = await guestPost(request({ message: 'Synthetic message' }), guestParams);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ messageStored: true, notification: { sms: 'failed' } });
  });
  it('reports a stored host reply separately from failed guest SMS', async () => {
    const result = await hostPost(request({ message: 'Synthetic reply' }), hostParams);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ messageStored: true, notification: { status: 'failed' } });
  });
  it('retains host message success and warns when escalation outcome fails', async () => {
    state.db = messagingDb({
      ...messagingSeed(),
      escalations: [{ id: ids.escalation, property_id: ids.property, stay_id: ids.stay, guest_session_id: ids.session, host_conversation_id: ids.conversation, status: 'open' }],
    }, { 'escalations:update': '57014 synthetic timeout with private provider detail' });
    const result = await hostPost(request({ message: 'Synthetic reply', escalationId: ids.escalation }), hostParams);
    const json = await result.json();
    expect(result.status).toBe(200);
    expect(json.messageStored).toBe(true);
    expect(json.workflowWarnings).toEqual(['Your reply was saved, but the escalation status could not be updated. Refresh and update its status separately; do not resend the reply.']);
    expect(state.db.rows.escalations[0].status).toBe('open');
    expect(JSON.stringify(json)).not.toContain('57014');
  });
  it('does not record a false extras transition after a failed request update', async () => {
    state.db = messagingDb({
      ...messagingSeed(),
      extras_orders: [{ id: ids.escalation, property_id: ids.property, stay_id: ids.stay, guest_session_id: ids.session, host_conversation_id: ids.conversation, fulfillment_status: 'requested' }],
    }, { 'extras_orders:update': '57014 synthetic timeout' });
    const result = await hostPost(request({ message: 'Synthetic reply', extrasOrderId: ids.escalation }), hostParams);
    const json = await result.json();
    expect(result.status).toBe(200);
    expect(json.messageStored).toBe(true);
    expect(json.workflowWarnings.join(' ')).toContain('extra request status could not be updated');
    expect(state.db.rows.extras_orders[0].fulfillment_status).toBe('requested');
    expect(state.db.writes.some((write: any) => write.table === 'extras_order_events')).toBe(false);
  });
  it.each([true, false])('never claims guest escalation reopened after failed update (explicit=%s)', async (explicit) => {
    const { notify } = await import('@/lib/notify');
    vi.mocked(notify).mockClear();
    state.db = messagingDb({
      ...messagingSeed(),
      escalations: [{ id: ids.escalation, property_id: ids.property, stay_id: ids.stay, guest_session_id: ids.session, host_conversation_id: ids.conversation, status: 'answered' }],
    }, { 'escalations:update': '57014 synthetic timeout' });
    const result = await guestPost(request({ message: 'Synthetic follow-up', ...(explicit ? { escalationId: ids.escalation } : {}) }), guestParams);
    const json = await result.json();
    expect(result.status).toBe(200);
    expect(json).toMatchObject({ messageStored: true, reopened: false });
    expect(json.workflowWarnings).toEqual(['Your message was saved, but the escalation could not be reopened. Ask your host to check its status; do not resend the message.']);
    expect(state.db.rows.escalations[0].status).toBe('answered');
    expect(vi.mocked(notify).mock.calls[0][1].title).not.toContain('reopened');
  });
});
