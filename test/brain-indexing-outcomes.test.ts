import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagingDb, ids } from './helpers/messaging-db';
const m = vi.hoisted(() => ({ db: null as any, embed: vi.fn(), bump: vi.fn(), generate: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => m.db }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }));
vi.mock('@/lib/auth/guards', () => ({
  requirePropertyAccess: async () => ({ can: { editBrain: true }, property: { host_account_id: ids.account } }),
  requireSession: async () => ({ user: { id: ids.owner } }),
}));
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({ embed: m.embed }),
  getEmbeddingProvider: () => ({ embed: m.embed }),
}));
vi.mock('@/lib/brain/cache', () => ({ bumpBrainVersion: m.bump }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: m.generate }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
import { saveBrainItemAction, reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';
import { saveFeatureAction, archiveFeatureAction } from '@/app/dashboard/properties/[id]/brain/feature-actions';
import { upsertNormalizedNode } from '@/lib/normalizer';

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ propertyId: ids.property, ...fields })) fd.set(key, value);
  return fd;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.db = messagingDb();
  m.embed.mockResolvedValue([[0.1]]);
  m.generate.mockResolvedValue({ text: '{"checkout_time":"15:00"}', model: 'strong' });
});
describe('manual source save and indexing outcomes', () => {
  it('reports durable source saved but unavailable indexing and scopes failure status', async () => {
    m.embed.mockRejectedValue(new Error('outage'));
    const result = await saveBrainItemAction({}, form({ title: 'Departure', body: 'Checkout is 11am.', section: 'checkout' }));
    expect(result).toMatchObject({
      ok: false, error: expect.stringMatching(/saved, but AI indexing failed/i),
      warning: expect.stringMatching(/saved.*index/i), itemId: expect.any(String),
    });
    expect(m.db.rows.brain_items[0].body).toBe('Checkout is 11am.');
    expect(m.db.rows.brain_items[0].status).toBe('failed');
    expect(m.db.writes.some((w: any) => w.table === 'property_knowledge_nodes')).toBe(false);
    const retryForm = form({
      itemId: result.itemId!, title: 'Departure', body: 'Checkout is 11am.', section: 'checkout',
    });
    const failedRetry = await saveBrainItemAction(result, retryForm);
    expect(failedRetry).toMatchObject({ ok: false, itemId: result.itemId, warning: expect.any(String) });
    expect(m.db.rows.brain_items).toHaveLength(1);
    m.embed.mockResolvedValue([[0.1]]);
    expect(await saveBrainItemAction(failedRetry, retryForm)).toEqual({ ok: true });
    expect(m.db.rows.brain_items).toHaveLength(1);
    expect(m.db.rows.brain_items[0]).toMatchObject({ id: result.itemId, status: 'ready', body: 'Checkout is 11am.' });
    expect(m.db.writes.filter((w: any) => w.table === 'brain_items' && w.op === 'insert')).toHaveLength(1);
  });
  it('reports failed chunk persistence instead of indexed success', async () => {
    m.db = messagingDb({}, { 'document_chunks:insert': 'db unavailable' });
    const result = await reindexBrainItem(ids.property, 'item-a', 'Departure', 'Checkout is 11am.', 'guest', 'checkin_checkout');
    expect(result).toEqual({ indexed: false });
  });
  it('rejects embedding batch mismatch rather than inserting undefined vectors', async () => {
    m.embed.mockResolvedValue([]);
    expect(await reindexBrainItem(ids.property, 'item-a', 'Departure', 'Checkout is 11am.', 'guest', 'checkin_checkout'))
      .toEqual({ indexed: false });
    expect(m.db.writes.some((w: any) => w.table === 'document_chunks' && w.op === 'insert')).toBe(false);
  });
  it('does not automatically publish or even generate AI-derived graph text', async () => {
    await upsertNormalizedNode(m.db, { propertyId: ids.property, brainItemId: 'item-a',
      category: 'checkin_checkout', title: 'Checkout', body: 'Checkout is 11am.' });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.embed).not.toHaveBeenCalled();
    expect(m.db.writes).toEqual([]);
  });
});
describe('feature cache invalidation', () => {
  it('invalidates after an explicit host save', async () => {
    expect(await saveFeatureAction({}, form({ label: 'Pool', guestAccess: 'supervised', notes: 'Ask the host first.' })))
      .toEqual({ ok: true });
    expect(m.bump).toHaveBeenCalledWith(m.db, ids.property);
  });
  it('invalidates after a successful feature edit and archive', async () => {
    m.db = messagingDb({ property_features: [{ id: 'feature-a', property_id: ids.property, label: 'Pool', archived_at: null }] });
    await saveFeatureAction({}, form({ featureId: 'feature-a', label: 'Pool', guestAccess: 'no' }));
    expect(m.bump).toHaveBeenCalledTimes(1);
    await archiveFeatureAction(form({ featureId: 'feature-a' }));
    expect(m.bump).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid access instead of granting unrestricted guest use', async () => {
    expect(await saveFeatureAction({}, form({ label: 'Pool', guestAccess: 'arbitrary' }))).toHaveProperty('error');
    expect(m.db.writes).toEqual([]);
  });
  it('does not claim a successful edit of another property feature', async () => {
    m.db = messagingDb({ property_features: [{ id: 'other-feature', property_id: 'property-b', archived_at: null }] });
    expect(await saveFeatureAction({}, form({ featureId: 'other-feature', label: 'Pool', guestAccess: 'no' })))
      .toHaveProperty('error');
    expect(m.bump).not.toHaveBeenCalled();
  });
});
