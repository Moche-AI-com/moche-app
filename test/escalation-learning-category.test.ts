import { beforeEach, expect, it, vi } from 'vitest';
import { ids, messagingDb, messagingSeed } from './helpers/messaging-db';

const state = vi.hoisted(() => ({ db: null as any, allowed: true, normalize: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => state.db }));
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: { id: ids.owner } }),
  requirePropertyAccess: async () => ({ can: {
    replyGuests: state.allowed, receiveEscalations: state.allowed, editBrain: state.allowed,
  } }),
}));
vi.mock('@/lib/brain/guest-answer-learning', () => ({ normalizeGuestAnswerForBrain: state.normalize }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/posthog-server', () => ({ capture: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyGuestConversationReply: vi.fn(async () => ({ status: 'skipped' })) }));
import { answerEscalationAction, answerEscalationCore } from '@/app/dashboard/escalations/actions';

beforeEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
  state.normalize.mockResolvedValue({
    question: 'Where can I park?', answer: 'Park in the marked space by the entrance.',
    category: 'core', section: 'parking', confidence: 0.9, model: 'synthetic-strong', rationale: 'Reusable.',
  });
  state.db = messagingDb({ ...messagingSeed(), escalations: [{
    id: ids.escalation, property_id: ids.property, stay_id: ids.stay, conversation_id: ids.conversation,
    host_conversation_id: ids.conversation, guest_session_id: ids.session, question: 'Synthetic question', status: 'open',
  }] });
});
function form(category: string, convert = true) {
  const data = new FormData();
  data.set('escalationId', ids.escalation);
  data.set('response', 'Synthetic host reply for future guests.');
  data.set('brainCategory', category);
  if (convert) data.set('convertToBrain', 'on');
  return data;
}
it.each(['auto', ''])('accepts %j as automatic classification and queues only the normalized draft', async (category) => {
  expect(await answerEscalationAction({}, form(category))).toMatchObject({ ok: true, learningQueued: true });
  expect(state.db.rows.proposed_updates[0]).toMatchObject({
    status: 'pending', field_path: 'host_qa.guest_reply',
    proposed_value: { category: 'core', section: 'parking', model: 'synthetic-strong' },
  });
  expect(state.db.writes.some((w: any) => ['brain_items', 'document_chunks', 'brain_values'].includes(w.table))).toBe(false);
});
it('honors the explicit host category and resets an incompatible AI section', async () => {
  expect(await answerEscalationAction({}, form('house_rules'))).toMatchObject({ ok: true, learningQueued: true });
  expect(state.db.rows.proposed_updates[0].proposed_value).toMatchObject({
    category: 'house_rules', section: 'house_rules',
    question: 'Where can I park?', answer: 'Park in the marked space by the entrance.', model: 'synthetic-strong',
  });
});
it('keeps a precise compatible section rather than replacing it with a coarse fallback', async () => {
  await answerEscalationAction({}, form('core'));
  expect(state.db.rows.proposed_updates[0].proposed_value).toMatchObject({ category: 'core', section: 'parking' });
});
it('rejects unsupported category input before any writes', async () => {
  expect((await answerEscalationAction({}, form('host_account_id'))).error).toBeTruthy();
  expect(state.db.writes).toHaveLength(0);
});
it('rejects invalid direct core overrides before side effects, not just form validation', async () => {
  expect((await answerEscalationCore(state.db, {
    escalationId: ids.escalation, answerText: 'Synthetic reply', actorProfileId: ids.owner,
    convertToBrain: true, brainCategory: 'bogus' as never,
  })).error).toBeTruthy();
  expect(state.db.writes).toHaveLength(0);
});
it('keeps an internal host category internal rather than publishing guest guidance', async () => {
  await answerEscalationAction({}, form('internal_notes'));
  expect(state.db.rows.proposed_updates[0].proposed_value).toMatchObject({
    category: 'internal_notes', visibility: 'internal',
  });
});
it('does not normalize or queue a one-off reply even when auto is selected', async () => {
  expect(await answerEscalationAction({}, form('auto', false))).toMatchObject({ ok: true, learningQueued: false });
  expect(state.normalize).not.toHaveBeenCalled();
  expect(state.db.rows.proposed_updates ?? []).toHaveLength(0);
});
it('keeps permission checks ahead of the reply and learning writes', async () => {
  state.allowed = false;
  expect((await answerEscalationAction({}, form('auto'))).error).toBeTruthy();
  expect(state.db.writes).toHaveLength(0);
  expect(state.normalize).not.toHaveBeenCalled();
});
