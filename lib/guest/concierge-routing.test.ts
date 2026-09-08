import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
const mocks = vi.hoisted(() => ({
  generate: vi.fn(), embed: vi.fn(), classify: vi.fn(), cache: vi.fn(), writeCache: vi.fn(),
}));
vi.mock('@/lib/ai', () => ({ getAIProvider: () => ({
  embed: mocks.embed, embedModel: 'test-embed', classifyIntent: mocks.classify,
}) }));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: mocks.generate }));
vi.mock('@/lib/local/canonical', () => ({ loadCanonicalPlaces: async () => [] }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('@/lib/brain/cache', () => ({
  normalizeQuestion: (s: string) => s.toLowerCase().trim().replace(/[?!.]+$/, ''),
  getBrainVersion: async () => 3, lookupCachedAnswer: mocks.cache, cacheAnswer: mocks.writeCache,
}));
import { answerGuestQuestion, isRoutineGuestQuestion } from './concierge';

function admin(items: Record<string, unknown>[] = [], values: Record<string, unknown>[] = []) {
  const operations: unknown[][] = [];
  const client = {
    from: (table: string) => {
      const data = table === 'brain_items' ? items : table === 'brain_values' ? values : [];
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit', 'or']) {
        query[method] = (...args: unknown[]) => { operations.push([table, method, ...args]); return query; };
      }
      query.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
      query.maybeSingle = async () => ({ data: null, error: null });
      return query;
    },
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return { client: client as unknown as SupabaseClient<Database>, operations };
}
const item = (over = {}) => ({
  id: 'approved-1', property_id: 'property-a', title: 'What time is checkout?',
  body: 'Checkout is at 11am.', category: 'checkin_checkout', section: 'checkout',
  source_type: 'manual_entry', created_by: 'host-a', status: 'ready', visibility: 'guest', deleted_at: null,
  ...over,
});
const opts = {
  propertyId: 'property-a', propertyName: 'Test house', question: 'What time is checkout?',
  history: [], persist: false, concierge: { language: 'en' },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.mockResolvedValue(null);
  mocks.embed.mockResolvedValue([[0.1]]);
  mocks.classify.mockResolvedValue('information');
  mocks.generate.mockResolvedValue({ text: 'I will check with the host.\nUNKNOWN: Please confirm this detail.', model: 'strong' });
});
describe('approved routine fast path and Wi-Fi containment', () => {
  it('returns the exact host-approved answer without embedding or generation', async () => {
    const db = admin([item()]);
    const result = await answerGuestQuestion(db.client, opts);
    expect(result.text).toBe('Checkout is at 11am.');
    expect(result.model).toBe('approved-brain');
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(db.operations).toContainEqual(['brain_items', 'eq', 'property_id', 'property-a']);
  });
  it.each([
    { history: [{ role: 'user' as const, content: 'Can we leave later because of our flight?' }] },
    { question: 'There is smoke, what time is checkout?' },
  ])('does not reuse deterministic or cached answers for contextual/safety requests', async (override) => {
    await answerGuestQuestion(admin([item()]).client, { ...opts, ...override });
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), { task: 'concierge_complex' });
  });
  it('does not reuse conflicting, internal, stale or other-property facts', async () => {
    const db = admin([item(), item({ id: 'second', body: 'Checkout is noon.' }),
      item({ property_id: 'property-b' }), item({ visibility: 'internal' }), item({ status: 'stale' })]);
    const result = await answerGuestQuestion(db.client, opts);
    expect(result.model).not.toBe('approved-brain');
  });
  it('answers a Wi-Fi credential request with the host-supplied location, never a cached secret', async () => {
    mocks.cache.mockResolvedValue({ answer: 'Secret987!', confidence: 1 });
    const db = admin([item({
      title: 'Wi-Fi password location', body: 'On the welcome card in the study.',
      category: 'core', section: 'connectivity',
    })]);
    const result = await answerGuestQuestion(db.client, { ...opts, question: 'What is the Wi-Fi password?' });
    expect(result.text).toContain('welcome card in the study');
    expect(result.text).not.toContain('Secret987');
    expect(result.text).not.toMatch(/fridge|kitchen/i);
    expect(mocks.cache).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('escalates Wi-Fi access with no approved location and never guesses', async () => {
    const db = admin([item({ title: 'Wi-Fi password', body: 'Secret987!', category: 'core', section: 'connectivity' })]);
    const result = await answerGuestQuestion(db.client, { ...opts, question: 'What is the Wi-Fi password?' });
    expect(result.shouldEscalate).toBe(true);
    expect(result.text).not.toMatch(/Secret987|fridge|arrival card|kitchen/i);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses the routine tier only when usable approved grounding is present', async () => {
    const db = admin();
    db.client.rpc = vi.fn().mockResolvedValue({ data: [{
      id: 'chunk', brain_item_id: 'approved', content: 'Checkout is at 11am.',
      category: 'checkin_checkout', similarity: 0.9,
    }], error: null }) as never;
    await answerGuestQuestion(db.client, opts);
    expect(mocks.generate).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), { task: 'concierge' });
  });
  it.each([
    'What time is checkout and can you waive the fee?',
    'What is the Wi-Fi password, I smell gas',
    'Where is parking. I lost my child.',
    'What time is checkout because my flight was cancelled?',
    'What is the Wi-Fi password if I smell gas?',
    'Where is parking while my child is missing?',
  ])('does not treat compound or safety context as routine: %s', (question) => {
    expect(isRoutineGuestQuestion(question, [])).toBe(false);
  });
  it('never caches a contextual answer under a history-free key', async () => {
    const db = admin();
    db.client.rpc = vi.fn().mockResolvedValue({ data: [{
      id: 'chunk', brain_item_id: 'approved', content: 'Checkout is at 11am.',
      category: 'checkin_checkout', similarity: 1,
    }], error: null }) as never;
    mocks.generate.mockResolvedValue({ text: 'Checkout is at 11am.', model: 'strong' });
    await answerGuestQuestion(db.client, {
      ...opts, persist: true, confidenceThreshold: 0.1,
      history: [{ role: 'user', content: 'Can I have an exception?' }],
    });
    expect(mocks.writeCache).not.toHaveBeenCalled();
  });
  it('does not let a cache bypass current restrictions', async () => {
    mocks.cache.mockResolvedValue({ answer: 'Checkout is at 11am.', confidence: 1 });
    await answerGuestQuestion(admin().client, { ...opts, concierge: { language: 'en', restrictedTopics: 'checkout' } });
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it('does not let an exact answer bypass a custom master prompt', async () => {
    const result = await answerGuestQuestion(admin([item()]).client, {
      ...opts, concierge: { language: 'en', masterPrompt: 'Do not discuss checkout times.' },
    });
    expect(result.model).not.toBe('approved-brain');
    expect(mocks.cache).not.toHaveBeenCalled();
  });
  it('excludes bare legacy Wi-Fi chunks whose source title carries the secret label', async () => {
    const db = admin([item({ id: 'wifi-old', title: 'Wi-Fi password', body: 'Secret987!' })]);
    db.client.rpc = vi.fn().mockResolvedValue({ data: [{
      id: 'chunk', brain_item_id: 'wifi-old', content: 'Secret987!', category: 'core', similarity: 0.9,
    }], error: null }) as never;
    await answerGuestQuestion(db.client, { ...opts, question: 'Why is the Wi-Fi not working?' });
    expect(JSON.stringify(mocks.generate.mock.calls)).not.toContain('Secret987!');
  });
  it('does not allow a model to invent a Wi-Fi location in a follow-up answer', async () => {
    mocks.generate.mockResolvedValue({ text: 'It is on the fridge.', model: 'strong' });
    const result = await answerGuestQuestion(admin().client, {
      ...opts, question: 'Where is the Wi-Fi password again?',
      history: [{ role: 'user', content: 'I need Wi-Fi access.' }],
    });
    expect(result.text).not.toContain('fridge');
    expect(result.shouldEscalate).toBe(true);
    expect(mocks.generate).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), { task: 'concierge_complex' });
  });
  it('contains an implicit Wi-Fi follow-up without repeating the topic', async () => {
    mocks.generate.mockResolvedValue({ text: 'It is on the fridge.', model: 'strong' });
    const result = await answerGuestQuestion(admin().client, {
      ...opts, question: 'Where can I find it?',
      history: [{ role: 'user', content: 'I need the Wi-Fi password.' }, { role: 'assistant', content: 'Secret987!' }],
    });
    expect(result.text).not.toContain('fridge');
    expect(result.shouldEscalate).toBe(true);
    expect(JSON.stringify(mocks.generate.mock.calls)).not.toContain('Secret987!');
  });
});
