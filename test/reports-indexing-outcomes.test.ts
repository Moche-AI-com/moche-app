import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ids, messagingDb } from './helpers/messaging-db';

const m = vi.hoisted(() => ({ db: null as any, reindex: vi.fn(), allowed: true }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => m.db }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }));
vi.mock('@/lib/auth/guards', () => ({
  requireSession: async () => ({ user: { id: ids.owner }, account: { id: ids.account } }),
  requirePropertyAccess: async () => ({ can: { editBrain: m.allowed } }),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/brain/cache', () => ({ bumpBrainVersion: vi.fn() }));
vi.mock('@/app/dashboard/properties/[id]/brain/actions', () => ({ reindexBrainItem: m.reindex }));
import { setMessageTrainingAction } from '@/app/dashboard/reports/actions';

function form(excluded = false) {
  const fd = new FormData();
  fd.set('messageId', ids.message);
  fd.set('escalationId', ids.escalation);
  fd.set('excluded', String(excluded));
  return fd;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.allowed = true;
  m.db = messagingDb({
    messages: [{ id: ids.message, property_id: ids.property, role: 'host', ai_training_excluded: true }],
    escalations: [{ id: ids.escalation, property_id: ids.property, converted_brain_item_id: 'item-existing' }],
    brain_items: [{ id: 'item-existing', property_id: ids.property, title: 'Departure', body: 'Checkout is 11am.',
      category: 'checkin_checkout', visibility: 'guest', deleted_at: '2026-01-01', status: 'stale' }],
  });
  m.reindex.mockResolvedValue({ indexed: true });
});

describe('report training inclusion indexing outcomes', () => {
  it.each(['false', 'throw'])('reports a saved preference but incomplete indexing on %s', async (failure) => {
    if (failure === 'throw') m.reindex.mockRejectedValue(new Error('PRIVATE provider details'));
    else m.reindex.mockResolvedValue({ indexed: false });
    const result = await setMessageTrainingAction({}, form());
    expect(result).toMatchObject({
      ok: true, warning: expect.stringMatching(/saved.*index/i), itemId: 'item-existing', retryExcluded: false,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(m.db.rows.messages[0].ai_training_excluded).toBe(false);
    expect(m.db.rows.brain_items[0]).toMatchObject({ body: 'Checkout is 11am.', status: 'failed' });
  });
  it('retries the same persisted target without inserting a duplicate or changing the source', async () => {
    m.reindex.mockResolvedValueOnce({ indexed: false }).mockResolvedValueOnce({ indexed: true });
    const first = await setMessageTrainingAction({}, form());
    expect(first).toHaveProperty('retryExcluded', false);
    expect(await setMessageTrainingAction(first, form())).toEqual({ ok: true });
    expect(m.reindex.mock.calls.map((args) => args.slice(0, 2)))
      .toEqual([[ids.property, 'item-existing'], [ids.property, 'item-existing']]);
    expect(m.db.rows.brain_items).toHaveLength(1);
    expect(m.db.rows.brain_items[0]).toMatchObject({ status: 'ready', body: 'Checkout is 11am.' });
    expect(m.db.writes.some((w: any) => w.op === 'insert')).toBe(false);
  });
  it('does not mark an item ready until indexing succeeds', async () => {
    m.reindex.mockImplementation(async () => {
      expect(m.db.rows.brain_items[0].status).toBe('processing');
      return { indexed: true };
    });
    expect(await setMessageTrainingAction({}, form())).toEqual({ ok: true });
    expect(m.db.rows.brain_items[0].status).toBe('ready');
  });
  it('warns and avoids indexing when the restore cannot be persisted', async () => {
    const seed = m.db.rows;
    m.db = messagingDb(seed, { 'brain_items:update': 'PRIVATE database details' });
    expect(await setMessageTrainingAction({}, form())).toMatchObject({
      ok: true, warning: expect.any(String), itemId: 'item-existing', retryExcluded: false,
    });
    expect(m.reindex).not.toHaveBeenCalled();
  });
  it('does not index or write when Brain permission is denied', async () => {
    m.allowed = false;
    expect(await setMessageTrainingAction({}, form())).toHaveProperty('error');
    expect(m.db.writes).toEqual([]);
    expect(m.reindex).not.toHaveBeenCalled();
  });
  it('does not index a converted target belonging to another property', async () => {
    m.db.rows.brain_items[0].property_id = 'other-property';
    await setMessageTrainingAction({}, form());
    expect(m.reindex).not.toHaveBeenCalled();
    expect(m.db.rows.brain_items[0].status).toBe('stale');
  });
  it('keeps exclusion and a missing converted target as non-indexing operations', async () => {
    expect(await setMessageTrainingAction({}, form(true))).toEqual({ ok: true });
    m.db.rows.escalations[0].converted_brain_item_id = null;
    expect(await setMessageTrainingAction({}, form())).toEqual({ ok: true });
    expect(m.reindex).not.toHaveBeenCalled();
  });
  it('offers an inclusion retry rather than flipping a partially saved preference to exclusion', () => {
    const ui = readFileSync('app/dashboard/reports/HandledEscalations.tsx', 'utf8');
    expect(ui).toContain('state.retryExcluded');
    expect(ui).toContain('Retry indexing');
    expect(ui).toContain('state.warning');
    expect(ui).toContain('Indexing incomplete');
  });
});
