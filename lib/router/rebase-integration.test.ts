import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const privateText = 'Email synthetic@example.test. Door code: 4321.';
const messages = [{ role: 'user' as const, content: privateText }];
const fetcher = vi.fn();
const answer = (model: string) => Response.json({
  model, choices: [{ message: { content: 'Synthetic answer' }, finish_reason: 'stop' }],
});
beforeEach(() => {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', VERCEL_ENV: 'production', AI_DEV_FALLBACK: 'false',
    AI_API_KEY: 'synthetic-chat', AI_BASE_URL: 'https://openrouter.ai/api/v1',
    AI_CHAT_MODEL: 'openai/gpt-4o-mini',
    OPENROUTER_API_KEY: 'synthetic-router', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_CONCIERGE_ENABLED: 'true',
    OPENROUTER_MODEL_GENERAL: 'openai/gpt-4o-mini',
    OPENROUTER_MODEL_CLASSIFICATION: 'openai/gpt-4o-mini',
    OPENROUTER_MODEL_EXTRACTION: 'openai/gpt-4o',
    OPENROUTER_MODEL_BRAIN_OPS: 'openai/gpt-4o',
    OPENROUTER_MODEL_CONCIERGE_COMPLEX: 'openai/gpt-4o',
    OPENROUTER_GUEST_MODEL_ALLOWLIST: 'google/gemini-2.5-flash,openai/gpt-4o-mini',
    OPENROUTER_PROVIDER_ALLOWLIST: 'openai',
    AI_FAILOVER_ENABLED: 'true', OLLAMA_API_KEY: '', OLLAMA_CLOUD_CHAT_MODEL: '',
    OPENAI_DIRECT_API_KEY: 'synthetic-independent', OPENAI_DIRECT_CHAT_MODEL: 'gpt-4o',
    AI_EMBED_USE_OPENROUTER: 'false', AI_EMBED_API_KEY: 'synthetic-embed',
    AI_EMBED_BASE_URL: 'https://api.openai.com/v1', AI_EMBED_MODEL: 'text-embedding-3-small',
  })) vi.stubEnv(key, value);
  fetcher.mockReset().mockImplementation(async (_url: string, init: RequestInit) =>
    answer(JSON.parse(init.body as string).model));
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each(['429', '503', 'network', 'timeout'])('preserves independent general fallback for %s outages', async (kind) => {
  fetcher.mockImplementationOnce(async () => {
    if (kind === 'network') throw new TypeError(privateText);
    if (kind === 'timeout') throw new DOMException(privateText, 'TimeoutError');
    return new Response('', { status: Number(kind) });
  });
  const { routedCompletion } = await import('./modelRouter');
  expect((await routedCompletion(messages, {}, { task: 'general' })).model).toBe('gpt-4o');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0]).toBe('https://api.openai.com/v1/chat/completions');
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer synthetic-independent');
  for (const [, init] of fetcher.mock.calls) expect(init.body).not.toMatch(/synthetic@example|4321/);
});

it('preserves Ollama-first then direct fallback for eligible classification outages', async () => {
  vi.stubEnv('OLLAMA_API_KEY', 'synthetic-ollama');
  vi.stubEnv('OLLAMA_CLOUD_CHAT_MODEL', 'gpt-oss:20b');
  fetcher.mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response('', { status: 429 }));
  const { routedCompletion } = await import('./modelRouter');
  expect((await routedCompletion(messages, {}, { task: 'classification' })).model).toBe('gpt-4o');
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    'https://openrouter.ai/api/v1/chat/completions',
    'https://ollama.com/v1/chat/completions',
    'https://api.openai.com/v1/chat/completions',
  ]);
});

it.each(['auth', 'policy', 'parse', 'model', 'unknown'])('does not reinterpret %s failure as an outage', async (kind) => {
  if (kind === 'policy') vi.stubEnv('OPENROUTER_PROVIDER_ALLOWLIST', 'unreviewed');
  fetcher.mockImplementationOnce(async () => {
    if (kind === 'unknown') throw new Error(privateText);
    if (kind === 'auth') return new Response('', { status: 403 });
    if (kind === 'parse') return new Response(privateText, { status: 200 });
    return answer('unreviewed/model');
  });
  const { routedCompletion } = await import('./modelRouter');
  const error = await routedCompletion(messages, {}, { task: 'general' }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  expect(fetcher).toHaveBeenCalledTimes(kind === 'policy' ? 0 : 1);
  expect(String(error)).not.toMatch(/synthetic@example|4321/);
});

it.each(['concierge', 'concierge_complex', 'brain_ops', 'extraction'] as const)('never independently downgrades %s', async (task) => {
  fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('normalizes secondary parser failures before they reach caller logging', async () => {
  fetcher.mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response(privateText, { status: 200 }));
  const { routedCompletion } = await import('./modelRouter');
  const error = await routedCompletion(messages, {}, { task: 'general' }).catch((e: unknown) => e);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toMatch(/synthetic@example|4321/);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/synthetic@example|4321/);
});

it.each(['disabled', 'multimodal'])('keeps independent fallback closed for %s requests', async (kind) => {
  if (kind === 'disabled') vi.stubEnv('AI_FAILOVER_ENABLED', 'false');
  fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
  const { routedCompletion } = await import('./modelRouter');
  const input = kind === 'multimodal'
    ? [{ role: 'user' as const, content: [{ type: 'text' as const, text: privateText }] }] : messages;
  await expect(routedCompletion(input, {}, { task: 'general' })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['false', 'true'])('sanitizes embeddings while preserving opt-in=%s routing', async (optIn) => {
  vi.stubEnv('AI_EMBED_USE_OPENROUTER', optIn);
  fetcher.mockResolvedValue(Response.json({ data: [{ index: 0, embedding: Array(1536).fill(0) }] }));
  const { openaiProvider } = await import('@/lib/ai/openai');
  const result = await openaiProvider.embedWithUsage!([privateText]);
  const [url, init] = fetcher.mock.calls[0];
  const body = JSON.parse(init.body);
  expect(init.body).not.toMatch(/synthetic@example|4321/);
  expect(url).toBe(optIn === 'true' ? 'https://openrouter.ai/api/v1/embeddings' : 'https://api.openai.com/v1/embeddings');
  expect(result.model).toBe(optIn === 'true' ? 'openai/text-embedding-3-small' : 'text-embedding-3-small');
  if (optIn === 'true') {
    expect(init.headers.Authorization).toBe('Bearer synthetic-router');
    expect(body.provider).toMatchObject({ zdr: true, data_collection: 'deny' });
    expect(openaiProvider.chatModel).toBe('openai/gpt-4o-mini');
  } else expect(body.provider).toBeUndefined();
});

it('OpenRouter embeddings do not require the unrelated direct/chat keys', async () => {
  vi.stubEnv('AI_EMBED_USE_OPENROUTER', 'true');
  vi.stubEnv('AI_API_KEY', '');
  vi.stubEnv('AI_EMBED_API_KEY', '');
  fetcher.mockResolvedValue(Response.json({ data: [{ index: 0, embedding: Array(1536).fill(0) }] }));
  const { getAIProvider } = await import('@/lib/ai');
  expect((await getAIProvider().embedWithUsage!([privateText])).model).toBe('openai/text-embedding-3-small');
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-router');
});

it('OpenRouter embeddings retain strict unique-index validation', async () => {
  vi.stubEnv('AI_EMBED_USE_OPENROUTER', 'true');
  fetcher.mockResolvedValue(Response.json({
    data: [0, 0].map((index) => ({ index, embedding: Array(1536).fill(0) })),
  }));
  const { openaiProvider } = await import('@/lib/ai/openai');
  await expect(openaiProvider.embed([privateText, privateText])).rejects.toThrow('ai_invalid_response');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
