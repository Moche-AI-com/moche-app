import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, messagingDb } from './helpers/messaging-db';

const state = vi.hoisted(() => ({
  db: null as any, access: true, edit: true, user: true,
  embed: vi.fn(), generate: vi.fn(), completion: vi.fn(), reindex: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => state.db }));
vi.mock('@/lib/auth/guards', () => ({
  getPropertyAccess: async () => state.access
    ? { can: { editBrain: state.edit }, property: { host_account_id: ids.account } } : null,
  getUser: async () => state.user ? { id: ids.owner } : null,
}));
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({ embed: state.embed, generate: state.generate, embedModel: 'synthetic-embedding' }),
}));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: state.completion }));
vi.mock('@/lib/acquisition/audit', () => ({
  ensureIngestionSource: vi.fn(async () => 'synthetic-source'), recordManualSource: vi.fn(),
}));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/dashboard/properties/[id]/brain/actions', () => ({ reindexBrainItem: state.reindex }));

import { POST } from '@/app/api/properties/[id]/updates/[updateId]/route';
import { applyProposal } from '@/lib/brain/apply-proposal';
import { createProposal } from '@/lib/brain/proposal-store';
import { normalizeProposedValue, proposableField } from '@/lib/brain/proposals';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import { getBrainVersion, lookupCachedAnswer } from '@/lib/brain/cache';
import { isCurrentGuestChunk } from '@/lib/guest/approved-context';
import { log } from '@/lib/log';

const proposalId = '90000000-0000-4000-8000-000000000001';
const learned = {
  question: 'Where can I park?',
  answer: 'Park in the marked space beside the entrance.',
  category: 'core', section: 'parking',
  model: 'synthetic-strong-model', rationale: 'Reusable host guidance.',
  sourceMessageIds: [ids.message],
};
const row = (value: unknown = learned) => ({
  id: proposalId, property_id: ids.property, host_account_id: ids.account,
  field_path: 'host_qa.guest_reply', status: 'pending', proposed_value: value,
  source_ref: ids.escalation, applied_at: null,
});

function resetDb(proposal = row(), failures: Record<string, string> = {}) {
  const db = messagingDb({
    proposed_updates: [proposal],
    properties: [{ id: ids.property }],
    property_settings: [{ property_id: ids.property }],
    property_brain_versions: [{ property_id: ids.property, version: 4 }],
    answer_cache: [{ property_id: ids.property, question_norm: 'where can i park',
      answer: 'Outdated parking answer.', confidence: 0.99, brain_version: 4 }],
  }, failures);
  const from = db.from;
  // Model database defaults, not application behavior. Real ingestion/apply run.
  db.from = (table) => {
    const query = from(table);
    if (table === 'brain_items' || table === 'proposed_updates') {
      const insert = query.insert;
      query.insert = (value: any) => insert(table === 'brain_items'
        ? { deleted_at: null, section: null, ...value } : { status: 'pending', reviewed_at: null, ...value });
    }
    return query;
  };
  state.db = Object.assign(db, {
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === 'bump_brain_version') {
        db.rows.property_brain_versions.find((r) => r.property_id === args.p_property_id)!.version++;
        return { data: 5, error: null };
      }
      if (name === 'brain_values_set') return { data: 'synthetic-value', error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    }),
  });
}
const decide = (decision = 'approve', value?: unknown, propertyId = ids.property) => POST(
  new Request('https://example.test/api/updates', {
    method: 'POST', body: JSON.stringify({ decision, ...(value === undefined ? {} : { value }) }),
  }),
  { params: Promise.resolve({ id: propertyId, updateId: proposalId }) },
);
const canonicalWrites = () => state.db.writes.filter((w: any) =>
  ['brain_items', 'document_chunks', 'brain_values'].includes(w.table));
const expectNoGeneration = () => {
  expect(state.generate).not.toHaveBeenCalled();
  expect(state.completion).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  state.access = state.edit = state.user = true;
  state.embed.mockReset().mockImplementation(async (texts: string[]) => texts.map(() => Array(1536).fill(0)));
  state.generate.mockRejectedValue(new Error('Approval must never generate content.'));
  state.completion.mockRejectedValue(new Error('Approval must never route a completion.'));
  state.reindex.mockReset().mockResolvedValue({ indexed: true });
  resetDb();
});

describe('learned answer proposal contract and review lifecycle', () => {
  it('recognizes the existing field and creates only a pending proposal', async () => {
    expect(proposableField('host_qa.guest_reply')).not.toBeNull();
    const result = await createProposal(state.db, {
      propertyId: ids.property, hostAccountId: ids.account, fieldPath: 'host_qa.guest_reply',
      label: learned.question, proposedValue: learned, sourceType: 'ai_suggestion', sourceRef: ids.escalation,
    });
    expect(result.ok).toBe(true);
    expect(state.db.rows.proposed_updates.at(-1)).toMatchObject({ status: 'pending', reviewed_at: null });
    expect(canonicalWrites()).toHaveLength(0);
    expect(state.embed).not.toHaveBeenCalled();
    expect(state.db.rpc).not.toHaveBeenCalled();
    expectNoGeneration();
  });

  it('approves a legacy pending reply, indexes exact reviewed content and serves the approved answer', async () => {
    const response = await decide();
    expect(response.status).toBe(200);
    const item = state.db.rows.brain_items[0];
    expect(item).toMatchObject({
      property_id: ids.property, title: learned.question, body: learned.answer,
      category: learned.category, section: learned.section,
      source_type: 'host_qa', created_by: ids.owner, visibility: 'guest', status: 'ready',
    });
    expect(state.db.rows.document_chunks[0]).toMatchObject({
      property_id: ids.property, brain_item_id: item.id,
      content: `${learned.question}\n\n${learned.answer}`, visibility: 'guest',
    });
    expect(state.db.rows.proposed_updates[0]).toMatchObject({
      status: 'approved', reviewed_by: ids.owner, applied_value: learned, source_ref: ids.escalation,
    });
    const reply = await answerGuestQuestion(state.db, {
      propertyId: ids.property, propertyName: 'Synthetic property', question: learned.question, history: [],
    });
    expect(reply.text).toBe(learned.answer);
    expectNoGeneration();
  });

  it('applies host edits to question, answer and filing; retains server provenance rather than client replacements', async () => {
    const edited = {
      ...learned, question: 'When are quiet hours?', answer: 'Quiet hours run from ten at night until eight in the morning.',
      category: 'house_rules', section: 'house_rules',
      model: 'forged-model', rationale: 'forged', sourceMessageIds: ['forged-id'],
    };
    expect((await decide('modify', edited)).status).toBe(200);
    expect(state.db.rows.brain_items[0]).toMatchObject({
      title: edited.question, body: edited.answer, category: edited.category, section: edited.section,
    });
    expect(state.db.rows.proposed_updates[0]).toMatchObject({
      status: 'modified', applied_value: { ...edited, model: learned.model,
        rationale: learned.rationale, sourceMessageIds: learned.sourceMessageIds },
    });
    expectNoGeneration();
  });

  it('honors the current review UI text edit without replaying the original answer', async () => {
    const text = 'Park only in the space marked for this property.';
    expect((await decide('modify', { ...learned, text })).status).toBe(200);
    expect(state.db.rows.brain_items[0].body).toBe(text);
    expect(state.db.rows.proposed_updates[0].applied_value.answer).toBe(text);
  });

  it('preserves the stored question and filing for a legacy text-only correction', async () => {
    const text = 'Use the side door';
    expect((await decide('modify', { text })).status).toBe(200);
    expect(state.db.rows.brain_items[0]).toMatchObject({
      title: learned.question, body: text, category: learned.category, section: learned.section,
    });
    expect(state.db.rows.proposed_updates[0].applied_value).toMatchObject({ ...learned, answer: text });
    expectNoGeneration();
  });

  it('declines a malformed legacy answer without ingestion or invalidation', async () => {
    resetDb(row({ answer: 'Legacy incomplete record' }));
    expect((await decide('deny')).status).toBe(200);
    expect(state.db.rows.proposed_updates[0].status).toBe('denied');
    expect(canonicalWrites()).toHaveLength(0);
    expect(state.db.rpc).not.toHaveBeenCalled();
    expectNoGeneration();
  });

  it.each(['approved', 'modified', 'denied'])('refuses repeat decisions on %s', async (status) => {
    state.db.rows.proposed_updates[0].status = status;
    expect((await decide()).status).toBe(409);
    expect(state.db.writes).toHaveLength(0);
  });

  it('allows only one application when two reviews arrive together', async () => {
    const responses = await Promise.all([decide(), decide()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(state.db.rows.brain_items).toHaveLength(1);
    expect(state.embed).toHaveBeenCalledTimes(1);
  });

  it('rejects another property proposal through an accessible property', async () => {
    state.db.rows.proposed_updates[0].property_id = 'other-property';
    expect((await decide()).status).toBe(404);
    expect(state.db.writes).toHaveLength(0);
  });

  it.each(['access', 'edit', 'user'] as const)('requires review authorization: %s', async (capability) => {
    state[capability] = false;
    expect((await decide()).status).toBe(capability === 'access' ? 404 : capability === 'edit' ? 403 : 401);
    expect(state.db.writes).toHaveLength(0);
    expectNoGeneration();
  });

  it('retains a partial failed review instead of resetting pending and creating duplicates on retry', async () => {
    state.embed.mockRejectedValueOnce(new Error('Synthetic embedding failure'));
    expect((await decide()).status).toBe(502);
    expect(state.db.rows.proposed_updates[0]).toMatchObject({ status: 'approved', applied_at: null });
    expect(state.db.rows.proposed_updates[0].apply_error).toBeTruthy();
    expect((await decide()).status).toBe(409);
    expect(state.db.rows.brain_items).toHaveLength(1);
    expect(state.db.rows.brain_items[0].status).toBe('failed');
    expect(state.db.rpc).toHaveBeenCalledWith('bump_brain_version', { p_property_id: ids.property });
  });

  it.each(['denied', 'zero rows', 'rejected request'])(
    'does not complete approval when the real pipeline ready transition returns %s',
    async (failure) => {
      const privateError = 'Synthetic private database ready-update detail';
      const transitions: { table: string; status: string; filters: Record<string, unknown> }[] = [];
      const from = state.db.from;
      state.db.from = (table: string) => {
        const query = from(table);
        const update = query.update;
        const eq = query.eq;
        const then = query.then;
        let transition: typeof transitions[number] | undefined;
        query.update = (patch: any) => {
          if (['brain_items', 'ingestion_jobs'].includes(table) && patch.status) {
            transition = { table, status: patch.status, filters: {} };
            transitions.push(transition);
          }
          return update(patch);
        };
        query.eq = (key: string, value: unknown) => {
          if (transition) transition.filters[key] = value;
          return eq(key, value);
        };
        query.then = (resolve: any, reject: any) => {
          if (transition?.table === 'brain_items' && transition.status === 'ready') {
            const result = failure === 'rejected request'
              ? Promise.reject(new Error(privateError))
              : Promise.resolve({
                data: null,
                error: failure === 'denied' ? { code: '42501', message: privateError } : null,
              });
            return result.then(resolve, reject);
          }
          return then(resolve, reject);
        };
        return query;
      };
      const response = await decide();
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ partial: true });
      expect(state.db.rows.proposed_updates[0]).toMatchObject({
        status: 'approved', applied_at: null, applied_value: learned,
      });
      expect(state.db.rows.proposed_updates[0].apply_error).toContain('incomplete');
      const item = state.db.rows.brain_items[0];
      const chunk = state.db.rows.document_chunks[0];
      expect(item.status).toBe('failed');
      expect(item.ingestion_error).toBe('Could not mark the knowledge item ready.');
      expect(chunk.content).toBe(`${learned.question}\n\n${learned.answer}`);
      expect(isCurrentGuestChunk(item, ids.property, chunk.content)).toBe(false);
      expect(state.db.rows.ingestion_jobs[0].status).toBe('failed');
      expect(transitions).toHaveLength(3);
      for (const transition of transitions) {
        expect(transition.filters.property_id).toBe(ids.property);
        expect(transition.filters.id).toBeTruthy();
      }
      expect(JSON.stringify(vi.mocked(log.warn).mock.calls)).not.toContain(privateError);
      expect(JSON.stringify(state.db.writes)).not.toContain(privateError);
      expect((await decide()).status).toBe(409);
      expect(state.db.rows.brain_items).toHaveLength(1);
      expect(state.db.rows.document_chunks).toHaveLength(1);
      expect(state.embed).toHaveBeenCalledTimes(1);
      expectNoGeneration();
    },
  );

  it('requires property and item scoped acknowledgement before successful ready publication', async () => {
    const from = state.db.from;
    let filters: Record<string, unknown> = {};
    let selected = '';
    state.db.from = (table: string) => {
      const query = from(table);
      const update = query.update;
      const eq = query.eq;
      const select = query.select;
      let ready = false;
      query.update = (patch: any) => {
        ready = table === 'brain_items' && patch.status === 'ready';
        return update(patch);
      };
      query.eq = (key: string, value: unknown) => {
        if (ready) filters = { ...filters, [key]: value };
        return eq(key, value);
      };
      query.select = (columns: string) => {
        if (ready) selected = columns;
        return select(columns);
      };
      return query;
    };
    expect((await decide()).status).toBe(200);
    expect(filters).toMatchObject({ property_id: ids.property, id: state.db.rows.brain_items[0].id });
    expect(selected).toBe('id');
    expect(state.db.rows.brain_items[0].status).toBe('ready');
    expect(state.db.rows.proposed_updates[0].applied_at).toBeTruthy();
    expectNoGeneration();
  });

  it('returns a known pre-write failure to pending, without invalidation', async () => {
    Object.assign(state.db.rows.proposed_updates[0], {
      field_path: 'brain.listing_summary',
      proposed_value: { title: 'Synthetic entry', text: learned.answer, category: 'core', featureId: ids.message },
    });
    expect((await decide()).status).toBe(502);
    expect(state.db.rows.proposed_updates[0]).toMatchObject({ status: 'pending', applied_at: null });
    expect(canonicalWrites()).toHaveLength(0);
    expect(state.db.rpc).not.toHaveBeenCalled();
  });

  it('does not advertise a failed replacement reindex as ready or reset the reviewed proposal', async () => {
    state.db.rows.brain_items = [{
      id: ids.message, property_id: ids.property, title: 'Previous guidance', body: 'Previous text',
      status: 'ready', deleted_at: null,
    }];
    Object.assign(state.db.rows.proposed_updates[0], {
      field_path: 'brain.listing_summary',
      proposed_value: { title: 'Updated guidance', text: learned.answer, category: 'core', replacesItemId: ids.message },
    });
    state.reindex.mockResolvedValue({ indexed: false, error: 'Synthetic private indexing error' });
    const response = await decide();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('Synthetic private indexing error');
    expect(state.db.rows.brain_items[0].status).toBe('failed');
    expect(state.db.rows.proposed_updates[0]).toMatchObject({ status: 'approved', applied_at: null });
    expect(state.db.rows.proposed_updates[0].apply_error).toBeTruthy();
    expect((await decide()).status).toBe(409);
    expect(state.db.rows.brain_items).toHaveLength(1);
    expectNoGeneration();
  });

  it('marks a replacement ready and invalidates only after confirmed reindex success', async () => {
    state.db.rows.brain_items = [{ id: ids.message, property_id: ids.property, status: 'ready', deleted_at: null }];
    const value = { title: 'Reviewed replacement', text: learned.answer, category: 'core', replacesItemId: ids.message };
    state.reindex.mockImplementationOnce(async () => {
      expect(state.db.rows.brain_items[0].status).toBe('processing');
      return { indexed: true };
    });
    const result = await applyProposal(state.db, {
      propertyId: ids.property, actorProfileId: ids.owner, fieldPath: 'brain.listing_summary', value,
    });
    expect(result).toMatchObject({ ok: true, targetId: ids.message });
    expect(state.db.rows.brain_items).toHaveLength(1);
    expect(state.db.rows.brain_items[0]).toMatchObject({ status: 'ready', title: value.title, body: value.text });
    expect(state.db.rpc).toHaveBeenCalledWith('bump_brain_version', { p_property_id: ids.property });
    expectNoGeneration();
  });

  it('retains a partial metadata failure after indexing without duplicating the approved entry', async () => {
    const from = state.db.from;
    state.db.from = (table: string) => {
      const query = from(table);
      if (table === 'brain_items') {
        const update = query.update;
        query.update = (patch: any) => {
          if (Object.hasOwn(patch, 'section')) {
            query.then = (resolve: any) => Promise.resolve({
              data: null, error: { message: 'Synthetic private metadata error' },
            }).then(resolve);
          }
          return update(patch);
        };
      }
      return query;
    };
    const response = await decide();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('Synthetic private metadata error');
    expect(state.db.rows.proposed_updates[0]).toMatchObject({ status: 'approved', applied_at: null });
    expect(state.db.rows.proposed_updates[0].apply_error).toBeTruthy();
    expect(state.db.rows.brain_items).toHaveLength(1);
    expect(state.db.rows.brain_items[0].status).toBe('failed');
    expect((await decide()).status).toBe(409);
    expect(state.db.rows.brain_items).toHaveLength(1);
  });

  it('blocks another apply when final review bookkeeping fails after content was indexed', async () => {
    const failures: Record<string, string> = {};
    resetDb(row(), failures);
    state.embed.mockImplementationOnce(async (texts: string[]) => {
      failures['proposed_updates:update'] = 'Synthetic bookkeeping failure';
      return texts.map(() => Array(1536).fill(0));
    });
    expect((await decide()).status).toBe(200);
    expect((await decide()).status).toBe(409);
    expect(state.db.rows.brain_items).toHaveLength(1);
  });

  it.each([
    { answer: '' }, { category: 'not-a-category' }, { category: 'internal_notes' },
    { section: 'not-a-section' }, { question: 'x'.repeat(501) },
    { question: 'What is the Wi-Fi password?', answer: 'The Wi-Fi password is SyntheticSecret2026!' },
    { question: 'What is the Wi-Fi password?', answer: 'sunflower' },
  ])('rejects invalid or credential-bearing learned content: %j', async (patch) => {
    expect((await decide('modify', { ...learned, ...patch })).status).toBe(400);
    expect(canonicalWrites()).toHaveLength(0);
    expect(state.db.rpc).not.toHaveBeenCalled();
  });

  it('preserves an approved Wi-Fi password location rather than redacting it', async () => {
    resetDb(row({ ...learned, question: 'Where is the Wi-Fi password?',
      answer: 'The password is on the router sticker.', section: 'connectivity' }));
    expect((await decide()).status).toBe(200);
    expect(state.db.rows.brain_items[0].body).toBe('The password is on the router sticker.');
  });

  it('stores an explicitly reviewed internal answer only as internal', async () => {
    expect((await decide('modify', { ...learned, category: 'internal_notes', visibility: 'internal' })).status).toBe(200);
    expect(state.db.rows.brain_items[0]).toMatchObject({ category: 'internal_notes', visibility: 'internal' });
    expect(state.db.rows.document_chunks[0].visibility).toBe('internal');
  });

  it.each(['11 AM', 'Use the side door'])('accepts a short reviewed answer without generating padding: %s', async (answer) => {
    expect((await decide('modify', { ...learned, answer })).status).toBe(200);
    expect(state.db.rows.brain_items[0]).toMatchObject({ title: learned.question, body: answer });
    expect(state.db.rows.document_chunks[0].content).toBe(`${learned.question}\n\n${answer}`);
    expectNoGeneration();
  });

  it('preserves the full legacy question up to its 500-character contract', async () => {
    const question = `Where can I park? ${'Synthetic context. '.repeat(18)}`;
    expect((await decide('modify', { ...learned, question })).status).toBe(200);
    expect(state.db.rows.brain_items[0].title).toBe(question.trim());
    expect(state.db.rows.document_chunks[0].content).toBe(`${question.trim()}\n\n${learned.answer}`);
  });

  it.each([null, [], 'Synthetic raw text', { ...learned, model: { injected: true } },
    { ...learned, sourceMessageIds: ['not-a-message-id'] }])('fails closed for malformed direct apply payload %j', async (value) => {
    expect((await applyProposal(state.db, {
      propertyId: ids.property, actorProfileId: ids.owner, fieldPath: 'host_qa.guest_reply', value,
    })).ok).toBe(false);
    expect(canonicalWrites()).toHaveLength(0);
    expectNoGeneration();
  });

  it('normalizes legacy replies without a section deterministically and idempotently', () => {
    const field = proposableField('host_qa.guest_reply');
    expect(field).not.toBeNull();
    if (!field) return;
    const value = { ...learned, category: 'host_qa', section: undefined };
    const result = normalizeProposedValue(field, value);
    expect(result).toMatchObject({ ok: true, value: { category: 'host_qa', section: 'space_details' } });
    if (result.ok) expect(normalizeProposedValue(field, result.value)).toEqual(result);
  });
});

describe('shared successful apply invalidation', () => {
  it.each([
    ['brain.listing_summary', { title: 'Parking instructions', text: learned.answer, category: 'core', section: 'parking' }],
    ['brain.document_summary', { title: 'Parking instructions', text: learned.answer, category: 'core' }],
    ['brain_value.wifi_password_location', 'On the router sticker.'],
    ['properties.city', 'Synthetic City'],
    ['property_settings.concierge_tone', 'friendly'],
  ])('invalidates stale guest answers after %s is applied', async (fieldPath, value) => {
    const result = await applyProposal(state.db, {
      propertyId: ids.property, actorProfileId: ids.owner, fieldPath, value,
    });
    expect(result.ok).toBe(true);
    expect(state.db.rpc).toHaveBeenCalledWith('bump_brain_version', { p_property_id: ids.property });
    expect(await lookupCachedAnswer(state.db, ids.property, 'where can i park',
      await getBrainVersion(state.db, ids.property))).toBeNull();
    expect(state.db.writes).toContainEqual({ table: 'answer_cache', op: 'delete', values: undefined });
    expectNoGeneration();
  });
});
