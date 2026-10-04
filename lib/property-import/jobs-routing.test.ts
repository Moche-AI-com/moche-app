import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  model: 'openai/gpt-4o',
  completion: vi.fn(),
  assertModel: vi.fn(),
  fetch: vi.fn(),
  operations: [] as { table: string; method: string; payload: any }[],
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/billing/quantity-sync', () => ({ syncBillableQuantity: vi.fn() }));
vi.mock('@/lib/ingest/firecrawl', () => ({
  fetchUrlContent: mocks.fetch,
  isSsrfError: () => false,
}));
vi.mock('@/lib/router/modelRouter', () => ({
  routedCompletion: mocks.completion,
  assertResolvedTaskModel: mocks.assertModel,
}));
vi.mock('./extract', () => ({
  assessFetchedPage: () => ({ usable: true }),
  ListingContentUnusableError: class extends Error {},
  buildListingDraft: async (_page: unknown, _url: string, generate: (messages: any[]) => Promise<string>) => {
    await generate([{ role: 'user', content: 'Synthetic listing description' }]);
    return { listingTitle: 'Synthetic villa', provider: 'synthetic', reviewGroups: [] };
  },
}));

import { runPastedTextImportJob, runPropertyImportJob } from './jobs';
import { PASTED_PROVIDER } from './pasted';

// Only the persistence/provider boundaries are synthetic. Both actual job runners
// and their shared generateExtraction callback execute without live calls.
function client() {
  return {
    from(table: string) {
      const query: any = {
        insert(payload: unknown) {
          mocks.operations.push({ table, method: 'insert', payload });
          return query;
        },
        update(payload: unknown) {
          mocks.operations.push({ table, method: 'update', payload });
          return query;
        },
        eq: () => query,
        select: () => query,
        single: async () => ({ data: { id: 'synthetic-property' }, error: null }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.operations = [];
  mocks.model = 'openai/gpt-4o';
  mocks.completion.mockImplementation(async () => ({
    text: '{}', model: mocks.model, usage: { promptTokens: 1, completionTokens: 1 },
  }));
  // Transport's real model validation has its own adapter regressions. This
  // boundary stub proves neither caller omits or replaces the resolved check.
  mocks.assertModel.mockImplementation((task, model) => {
    if (task !== 'extraction' || model !== 'openai/gpt-4o') throw new Error('ai_model_mismatch');
  });
  mocks.fetch.mockResolvedValue({ title: 'Synthetic villa', text: 'Synthetic listing', sourceUrl: 'https://listing.invalid' });
});

describe.each(['url', 'paste'] as const)('%s listing extraction routing', (kind) => {
  const run = () => kind === 'url'
    ? runPropertyImportJob(client(), {
      jobId: 'synthetic-job', hostAccountId: 'synthetic-account', createdBy: 'synthetic-owner',
      sourceUrl: 'https://listing.invalid',
    })
    : runPastedTextImportJob(client(), {
      jobId: 'synthetic-job', hostAccountId: 'synthetic-account', pastedText: 'Synthetic villa listing',
    });

  it('uses the shared strong route and keeps the result awaiting host review', async () => {
    const result = await run();
    expect(result.ok).toBe(true);
    expect(mocks.completion).toHaveBeenCalledWith(expect.any(Array),
      { temperature: 0.1, maxTokens: 4000 }, { task: 'extraction' });
    expect(mocks.assertModel).toHaveBeenCalledWith('extraction', 'openai/gpt-4o');
    expect(mocks.operations).toContainEqual(expect.objectContaining({
      table: 'property_import_jobs', method: 'update',
      payload: expect.objectContaining({ status: 'awaiting_review' }),
    }));
    if (kind === 'paste') {
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(result.ok && result.draft.provider).toBe(PASTED_PROVIDER);
    }
  });

  it.each(['openai/gpt-4o-mini', 'unexpected/model'])('rejects %s before creating a property', async (model) => {
    mocks.model = model;
    const result = await run();
    expect(result.ok).toBe(false);
    expect(mocks.assertModel).toHaveBeenCalledWith('extraction', model);
    expect(mocks.operations.some((op) => op.table === 'properties' && op.method === 'insert')).toBe(false);
    expect(mocks.operations).toContainEqual(expect.objectContaining({
      table: 'property_import_jobs', method: 'update',
      payload: expect.objectContaining({ status: 'failed', error_reason: 'extraction_unavailable' }),
    }));
    if (kind === 'paste') expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
