import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Real translation + router; mocked HTTP only. Never use deployment credentials
// or a live model. The opt-out must govern guest text in this non-chat caller.
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('AI_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-router-key');
  vi.stubEnv('OPENROUTER_CONCIERGE_ENABLED', 'true');
  vi.stubEnv('OPENROUTER_MODEL_CONCIERGE_COMPLEX', 'openai/gpt-4o');
  vi.stubEnv('OPENROUTER_PROVIDER_ALLOWLIST', 'openai');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('translation crosses only an eligible protected guest route', () => {
  it('makes no external call when guest routing is opted out', async () => {
    vi.stubEnv('OPENROUTER_CONCIERGE_ENABLED', 'false');
    const fetcher = vi.fn().mockRejectedValue(new Error('unexpected HTTP'));
    vi.stubGlobal('fetch', fetcher);
    const { translateForHost } = await import('./translate');
    expect(await translateForHost('Huele a gas. Código 0428.', 'es', 'en')).toMatchObject({
      text: 'Huele a gas. Código 0428.', translated: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('routes safety-sensitive translation with one strong model and privacy restrictions', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ model: 'openai/gpt-4o', choices: [{ message: { content: 'It smells of gas.' } }] }),
    });
    vi.stubGlobal('fetch', fetcher);
    const { translateForHost } = await import('./translate');
    const result = await translateForHost('Huele a gas.', 'es', 'en');
    expect(result.text).toContain('Huele a gas.');
    expect(result.translated).toBe('It smells of gas.');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.models).toEqual(['openai/gpt-4o']);
    expect(body.provider).toMatchObject({ zdr: true, data_collection: 'deny', only: ['openai'] });
  });

  it('cannot bypass guest opt-out using OpenRouter through the alternate AI endpoint', async () => {
    vi.stubEnv('OPENROUTER_CONCIERGE_ENABLED', 'false');
    vi.stubEnv('AI_API_KEY', 'synthetic-alternate-key');
    vi.stubEnv('AI_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('AI_CONCIERGE_COMPLEX_MODEL', 'openai/gpt-4o');
    const fetcher = vi.fn().mockRejectedValue(new Error('unexpected HTTP'));
    vi.stubGlobal('fetch', fetcher);
    const { translateForHost } = await import('./translate');
    const original = 'Huele a gas. Código 0428.';
    expect(await translateForHost(original, 'es', 'en')).toEqual({ text: original, translated: null, targetLabel: null });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'malformed', 'empty'])('retains the original without cheaper fallback on %s', async (mode) => {
    const fetcher = mode === 'timeout'
      ? vi.fn().mockRejectedValue(new DOMException('Synthetic timeout', 'TimeoutError'))
      : vi.fn().mockResolvedValue({ ok: true, json: async () => mode === 'empty' ? { choices: [{ message: { content: '' } }] } : {} });
    vi.stubGlobal('fetch', fetcher);
    const { translateForHost } = await import('./translate');
    const original = 'Huele a gas. No entre. 17:30.';
    expect(await translateForHost(original, 'es', 'en')).toEqual({ text: original, translated: null, targetLabel: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
