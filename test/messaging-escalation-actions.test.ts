import { beforeEach, expect, it, vi } from 'vitest';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';
const state = vi.hoisted(() => ({ db: null as any, allowed: true }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => state.db }));
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: { id: '70000000-0000-4000-8000-000000000001' } }),
  requirePropertyAccess: async () => ({ can: { replyGuests: state.allowed, receiveEscalations: state.allowed, editBrain: state.allowed }, isOwner: state.allowed }),
}));
vi.mock('@/app/dashboard/properties/[id]/brain/actions', () => ({ reindexBrainItem: vi.fn() }));
vi.mock('@/lib/brain/classify', () => ({ classifyBrainAnswer: async () => ({ title: 'Synthetic guidance', category: 'host_qa' }) }));
vi.mock('@/lib/brain/guest-answer-learning', () => ({
  normalizeGuestAnswerForBrain: async () => ({ question: 'Synthetic guidance question', answer: 'Synthetic reusable guidance.', category: 'host_qa', section: 'general', confidence: 0.9, model: 'mock', rationale: null }),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/posthog-server', () => ({ capture: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyGuestReply: vi.fn(), notifyGuestConversationReply: vi.fn(async () => ({ status: 'failed' })) }));
import { answerEscalationCore, openEscalationThreadAction } from '@/app/dashboard/escalations/actions';
beforeEach(() => {
  state.allowed = true;
  state.db = messagingDb({ ...messagingSeed(), escalations: [{
    id: ids.escalation, property_id: ids.property, stay_id: ids.stay, conversation_id: ids.conversation,
    host_conversation_id: ids.conversation, guest_session_id: ids.session, question: 'Synthetic question', status: 'open',
  }] });
});
const reply = () => answerEscalationCore(state.db, { escalationId: ids.escalation, answerText: 'Synthetic reply', actorProfileId: ids.owner, convertToBrain: true });
it('core action itself requires capability even when invoked outside dashboard form', async () => {
  state.allowed = false;
  expect((await reply()).error).toBeTruthy();
  expect(state.db.writes).toHaveLength(0);
});
it('rejects a cross-stay conversation before Brain, escalation or message writes', async () => {
  state.db.rows.conversations[0].stay_id = 'other-stay';
  expect((await reply()).error).toBeTruthy();
  expect(state.db.writes).toHaveLength(0);
});
it('rejects cross-property or wrong-party stored escalation thread pointers', async () => {
  state.db.rows.conversations[0].guest_session_id = 'another-party';
  expect((await openEscalationThreadAction(ids.escalation)).error).toBeTruthy();
  expect(state.db.writes).toHaveLength(0);
});
it('saves a reply, reports SMS failure and queues only a human-review proposal', async () => {
  const result = await reply();
  expect(result).toMatchObject({ ok: true, messageStored: true, notification: { status: 'failed' }, learningQueued: true });
  expect(state.db.writes.some((w: any) => w.table === 'brain_items')).toBe(false);
  expect(state.db.writes.find((w: any) => w.table === 'proposed_updates')?.values.status).toBe('pending');
});
