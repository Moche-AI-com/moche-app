import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('AI_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', 'test-router');
  vi.stubEnv('OPENROUTER_CONCIERGE_ENABLED', 'true');
  vi.stubEnv('AI_DEV_FALLBACK', 'true');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('high-reliability routing cannot silently downgrade', () => {
  for (const task of ['brain_ops', 'extraction', 'concierge_complex'] as const) {
    it(`${task} fails closed on provider failure`, async () => {
      const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      vi.stubGlobal('fetch', fetcher);
      const { routedCompletion } = await import('./modelRouter');
      await expect(routedCompletion([{ role: 'user', content: 'Synthetic house guidance' }], {}, { task }))
        .rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it(`${task} cannot use the development/general provider without configuration`, async () => {
      vi.stubEnv('OPENROUTER_API_KEY', '');
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const { routedCompletion } = await import('./modelRouter');
      await expect(routedCompletion([], {}, { task })).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });
  }

  it('uses a dedicated strong tier for complex guests, not the routine allowlist', async () => {
    vi.stubEnv('OPENROUTER_MODEL_CONCIERGE_COMPLEX', 'openai/gpt-4o');
    const fetcher = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: 'Grounded answer' } }] }),
    });
    vi.stubGlobal('fetch', fetcher);
    const { routedCompletion } = await import('./modelRouter');
    await routedCompletion([], {}, { task: 'concierge_complex' });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.models).toEqual(['openai/gpt-4o']);
    expect(body.provider.zdr).toBe(true);
  });

  it('uses the strong model on the configured direct endpoint without an OpenRouter key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('AI_API_KEY', 'test-direct');
    vi.stubEnv('AI_BASE_URL', 'https://api.openai.com/v1');
    vi.stubEnv('AI_BRAIN_MODEL', 'gpt-4o');
    vi.stubEnv('AI_CHAT_MODEL', 'gpt-4o-mini');
    const fetcher = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    vi.stubGlobal('fetch', fetcher);
    const { routedCompletion } = await import('./modelRouter');
    await routedCompletion([], {}, { task: 'brain_ops' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('gpt-4o');
  });
});
