import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messages = [{ role: 'user' as const, content: 'Synthetic routine request.' }];
const response = (status: number, model = 'gpt-oss:20b') => new Response(
  JSON.stringify({ model, choices: [{ message: { content: 'Synthetic answer.' } }] }),
  { status, headers: { 'Content-Type': 'application/json' } },
);

describe('routedCompletion independent outage hops', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-router-key');
    vi.stubEnv('AI_API_KEY', 'synthetic-legacy-key');
    vi.stubEnv('AI_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('OLLAMA_API_KEY', 'synthetic-ollama-key');
    vi.stubEnv('OLLAMA_CLOUD_CHAT_MODEL', 'gpt-oss:20b');
    vi.stubEnv('OPENAI_DIRECT_API_KEY', 'synthetic-direct-key');
    vi.stubEnv('AI_FAILOVER_ENABLED', 'true');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it('routes a retryable general-task outage to Ollama rather than AI_BASE_URL', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200));
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const { routedCompletion } = await import('./modelRouter');
    await expect(routedCompletion(messages, undefined, { task: 'general' }))
      .resolves.toMatchObject({ text: 'Synthetic answer.' });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://openrouter.ai/api/v1/chat/completions',
      'https://ollama.com/v1/chat/completions',
    ]);
  });

  it('reaches direct OpenAI after independent Ollama 503', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, 'gpt-4o'));
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const { routedCompletion } = await import('./modelRouter');
    await routedCompletion(messages, undefined, { task: 'classification' });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://openrouter.ai/api/v1/chat/completions',
      'https://ollama.com/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ]);
  });

  it('never hops on gateway authentication refusal', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(401));
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const { routedCompletion } = await import('./modelRouter');
    await expect(routedCompletion(messages, undefined, { task: 'general' }))
      .rejects.toThrow('401');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not downgrade strong Brain work on a 503', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(503));
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const { routedCompletion } = await import('./modelRouter');
    await expect(routedCompletion(messages, undefined, { task: 'brain_ops' }))
      .rejects.toThrow('503');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
