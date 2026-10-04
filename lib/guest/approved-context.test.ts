import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagingDb } from '@/test/helpers/messaging-db';
const m = vi.hoisted(() => ({ embed: vi.fn(), generate: vi.fn(), usage: vi.fn(), cache: vi.fn() }));
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({ embedWithUsage: m.embed, embedModel: 'configured-embed' }),
  getEmbeddingProvider: () => ({ embedWithUsage: m.embed, embedModel: 'configured-embed' }),
}));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: m.generate }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: m.usage }));
vi.mock('@/lib/local/canonical', () => ({ loadCanonicalPlaces: async () => [] }));
vi.mock('@/lib/brain/cache', () => ({
  normalizeQuestion: (s: string) => s.toLowerCase().replace(/[?!.]+$/, '').trim(),
  getBrainVersion: async () => 1, lookupCachedAnswer: m.cache, cacheAnswer: vi.fn(),
}));
import { answerGuestQuestion } from './concierge';

const note = (over = {}) => ({
  id: 'note-a', property_id: 'property-a', title: 'Departure guidance', body: 'Checkout is at 11am.',
  category: 'checkin_checkout', section: 'checkout', source_type: 'manual_entry',
  created_by: 'host-a', visibility: 'guest', status: 'ready', deleted_at: null, feature_id: null, ...over,
});
const value = (over = {}) => ({
  field_id: 'checkout_time', property_id: 'property-a', value: '10:00', source: 'host_verified',
  status: 'active', audience: 'guest_public', sensitivity_tier: 'public_guest',
  verified_by: 'host-a', verified_at: '2026-01-01T00:00:00Z', ttl_expires_at: null, superseded_by: null, ...over,
});
const feature = (over = {}) => ({
  id: 'feature-a', property_id: 'property-a', label: 'Pool', location: 'East courtyard',
  notes: 'Close the safety gate after use.', guest_access: 'supervised', archived_at: null,
  created_by: 'host-a', created_via: 'host', ...over,
});
const chunk = (over = {}) => ({
  id: 'chunk-a', brain_item_id: 'note-a', content: 'Checkout is at 11am.',
  category: 'checkin_checkout', similarity: 0.95, ...over,
});
function db(seed = {}, chunks = [chunk()], failure?: string) {
  const mem = messagingDb(seed);
  const selects: string[] = [];
  const from = (table: string) => {
    const q = mem.from(table);
    const select = q.select;
    q.select = (columns: string) => { selects.push(columns); return select(columns); };
    return q;
  };
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'match_property_knowledge'
      ? [{ id: 'unreviewed', node_type: 'checkout', title: 'AI-derived checkout', content: 'Unapproved checkout is 3pm.', similarity: 1 }]
      : chunks,
    error: failure ? { message: failure } : null,
  }));
  return { client: { ...mem, from, rpc } as never, rpc, selects };
}
const opts = { propertyId: 'property-a', propertyName: 'Sample house', question: 'What time is checkout?', history: [], persist: false };
beforeEach(() => {
  vi.clearAllMocks();
  m.embed.mockResolvedValue({ vectors: [[0.1]], model: 'actual-embedding-model', totalTokens: 12 });
  m.generate.mockResolvedValue({ text: 'Please confirm with your host.', model: 'chat-model', usage: { promptTokens: 50, completionTokens: 9 } });
  m.cache.mockResolvedValue(null);
});
const prompt = () => String(m.generate.mock.calls[0]?.[0]?.[0]?.content ?? '');

describe('guest approved-context boundary', () => {
  it('keeps unrelated exact approved answers model-free on properties with features', async () => {
    const answer = await answerGuestQuestion(db({
      brain_items: [note({ title: opts.question })], property_features: [feature()],
    }).client, opts);
    expect(answer.model).toBe('approved-brain');
    expect(answer.text).toBe('Checkout is at 11am.');
    expect(m.embed).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
  });
  it('exact notes linked to an archived or restricted feature cannot bypass containment', async () => {
    for (const restriction of [{ guest_access: 'no' }, { guest_access: 'supervised' }, { archived_at: '2026-01-01' }]) {
      const answer = await answerGuestQuestion(db({
        brain_items: [note({ title: opts.question, feature_id: 'feature-a' })],
        property_features: [feature(restriction)],
      }).client, opts);
      expect(answer.model).not.toBe('approved-brain');
    }
  });
  it('uses approved current source chunks, never an unreviewed graph derivative', async () => {
    const d = db({ brain_items: [note()] });
    await answerGuestQuestion(d.client, opts);
    expect(prompt()).toContain('Checkout is at 11am.');
    expect(prompt()).not.toContain('Unapproved checkout is 3pm.');
    expect(d.rpc.mock.calls.map(([name]) => name)).not.toContain('match_property_knowledge');
  });
  it.each([
    { visibility: 'internal' }, { status: 'processing' }, { status: 'failed' },
    { deleted_at: '2026-01-01' }, { property_id: 'property-b' }, { created_by: null },
    { body: 'Checkout is now at 9am.' }, { category: 'internal_notes' },
  ])('rejects stale/hidden/deleted/pending/cross-property source: %j', async (over) => {
    await answerGuestQuestion(db({ brain_items: [note(over)] }).client, opts);
    expect(prompt()).not.toContain('Checkout is at 11am.');
  });
  it('rejects orphan chunks without a current source', async () => {
    await answerGuestQuestion(db({}, [chunk({ brain_item_id: null })]).client, opts);
    expect(prompt()).not.toContain('Checkout is at 11am.');
  });
  it('preserves approved imported source chunks without requiring AI graph publication', async () => {
    await answerGuestQuestion(db({ brain_items: [note({ source_type: 'document' })] }).client, opts);
    expect(prompt()).toContain('Checkout is at 11am.');
  });
  it('linked source chunks cannot restore access to archived or restricted features', async () => {
    for (const restriction of [{ guest_access: 'no' }, { guest_access: 'supervised' }, { archived_at: '2026-01-01' }]) {
      m.generate.mockClear();
      await answerGuestQuestion(db({
        brain_items: [note({ feature_id: 'feature-a', body: 'Guests can use the facility freely.' })],
        property_features: [feature(restriction)],
      }, [chunk({ content: 'Guests can use the facility freely.' })]).client,
      { ...opts, question: 'Tell me about the facility' });
      expect(prompt()).not.toContain('Guests can use the facility freely.');
    }
  });
  it('does not choose between conflicting active verified values', async () => {
    await answerGuestQuestion(db({ brain_values: [value(), value({ value: '12:00' })] }, []).client, opts);
    expect(prompt()).not.toContain('Checkout time:');
  });
  it('current registry facts override stale source text, exact answers and cached answers', async () => {
    m.cache.mockResolvedValue({ answer: 'Checkout is at 4pm.', confidence: 1 });
    const d = db({ brain_items: [note({ title: opts.question })], brain_values: [value()] });
    const answer = await answerGuestQuestion(d.client, opts);
    expect(answer.model).not.toBe('cache');
    expect(answer.model).not.toBe('approved-brain');
    expect(prompt()).toContain('Checkout time: 10:00');
    expect(prompt()).not.toContain('Checkout is at 11am.');
    expect(m.cache).not.toHaveBeenCalled();
    expect(d.selects.join()).not.toContain('secret_ref_or_ciphertext');
  });
  it.each([
    { source: 'ai_inferred' }, { audience: 'host_private' }, { sensitivity_tier: 'host_only' },
    { sensitivity_tier: 'stay_scoped_secret' }, { verified_by: null }, { verified_at: 'invalid' },
    { verified_at: '2099-01-01' }, { ttl_expires_at: '2000-01-01' }, { ttl_expires_at: 'invalid' },
    { status: 'retired' }, { superseded_by: 'new-value' }, { property_id: 'property-b' },
    { field_id: 'door_code_or_entry_method' },
  ])('never exposes unsafe/unverified registry values: %j', async (over) => {
    await answerGuestQuestion(db({ brain_values: [value({ value: 'NEVER-PUBLISH-VALUE', ...over })] }, []).client, opts);
    expect(prompt()).not.toContain('NEVER-PUBLISH-VALUE');
  });
  it('expired registry facts cannot resurrect older approved notes or cache', async () => {
    m.cache.mockResolvedValue({ answer: 'Checkout is at 4pm.', confidence: 1 });
    await answerGuestQuestion(db({ brain_items: [note({ title: opts.question })],
      brain_values: [value({ ttl_expires_at: '2000-01-01' })] }).client, opts);
    expect(prompt()).not.toContain('Checkout is at 11am.');
    expect(prompt()).not.toContain('Checkout time: 10:00');
    expect(m.cache).not.toHaveBeenCalled();
  });
  it('uses host-saved active features and preserves access restrictions', async () => {
    await answerGuestQuestion(db({ property_features: [feature(),
      feature({ id: 'private', label: 'Workshop', guest_access: 'no', notes: 'PRIVATE-WORKSHOP-DETAIL' }),
      feature({ id: 'archived', label: 'Old spa', archived_at: '2026-01-01' }),
      feature({ id: 'draft', label: 'DRAFT-SPA', created_via: 'ai' }),
      feature({ id: 'other', label: 'OTHER-POOL', property_id: 'property-b' })] }, []).client,
    { ...opts, question: 'Tell me about the pool and workshop' });
    expect(prompt()).toContain('East courtyard');
    expect(prompt()).toContain('Close the safety gate');
    expect(prompt()).toContain('only with host approval or supervision');
    expect(prompt()).toContain('Workshop: not for guest use');
    expect(prompt()).not.toMatch(/PRIVATE-WORKSHOP-DETAIL|Old spa|DRAFT-SPA|OTHER-POOL/);
  });
  it.each(['embedding', 'retrieval', 'generation'])('hands off safely on %s failure', async (stage) => {
    if (stage === 'embedding') m.embed.mockRejectedValue(new Error('provider unavailable'));
    if (stage === 'generation') m.generate.mockRejectedValue(new Error('provider unavailable'));
    const answer = await answerGuestQuestion(db({}, [], stage === 'retrieval' ? 'rpc unavailable' : undefined).client, opts);
    expect(answer.shouldEscalate).toBe(true);
    expect(answer.confidence).toBe(0);
    expect(answer.model).toBe('error');
    if (stage !== 'generation') expect(m.generate).not.toHaveBeenCalled();
  });
  it('records actual embedding and chat usage in separate model-priced rows', async () => {
    await answerGuestQuestion(db({}, []).client, { ...opts, persist: true });
    expect(m.usage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      kind: 'embed', model: 'actual-embedding-model', embedTokens: 12,
    }));
    const chat = m.usage.mock.calls.map((c) => c[1]).find((r) => r.kind === 'chat');
    expect(chat).toMatchObject({ model: 'chat-model', promptTokens: 50, completionTokens: 9 });
    expect(chat.embedTokens ?? 0).toBe(0);
  });
});
