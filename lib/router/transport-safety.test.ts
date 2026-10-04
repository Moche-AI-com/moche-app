import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const privateText = 'Contact synthetic.person@example.test. Door code: 4321. Wi-Fi password: SyntheticCanary2026!';
const messages = [{ role: 'user' as const, content: privateText }];
const vector = () => Array(1536).fill(0.1);
const response = (model: string) => Response.json({
  model, choices: [{ message: { content: 'Synthetic answer' }, finish_reason: 'stop' }],
});
const fetcher = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', VERCEL_ENV: 'production', AI_DEV_FALLBACK: 'false',
    AI_API_KEY: 'synthetic-alias', AI_BASE_URL: 'https://openrouter.ai/api/v1',
    AI_CHAT_MODEL: 'openai/gpt-4o-mini', AI_BRAIN_MODEL: 'openai/gpt-4o',
    AI_EXTRACTION_MODEL: 'openai/gpt-4o', AI_CONCIERGE_COMPLEX_MODEL: 'openai/gpt-4o',
    OPENROUTER_API_KEY: 'synthetic-router', OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_CONCIERGE_ENABLED: 'true', OPENROUTER_MODEL_EXTRACTION: 'openai/gpt-4o',
    OPENROUTER_MODEL_BRAIN_OPS: 'openai/gpt-4o', OPENROUTER_MODEL_CONCIERGE_COMPLEX: 'openai/gpt-4o',
    OPENROUTER_GUEST_MODEL_ALLOWLIST: 'google/gemini-2.5-flash,openai/gpt-4o-mini',
    OPENROUTER_PROVIDER_ALLOWLIST: 'openai,google-vertex',
    AI_EMBED_API_KEY: 'synthetic-embed', AI_EMBED_BASE_URL: 'https://api.openai.com/v1',
    AI_EMBED_MODEL: 'text-embedding-3-small',
  })) vi.stubEnv(key, value);
  fetcher.mockReset();
  fetcher.mockImplementation(async (_url: string, init: RequestInit) => response(JSON.parse(init.body as string).model));
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.doUnmock('@/lib/ai/redaction'); });

it.each(['concierge', 'general', 'classification'] as const)('never retries %s outages through the raw alias', async (task) => {
  fetcher.mockImplementationOnce(async () => new Response('private error', { status: 503 }));
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.provider.zdr).toBe(true);
  expect(JSON.stringify(body.messages)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
});

it.each([
  ['OPENROUTER_CONCIERGE_ENABLED', 'false'],
  ['OPENROUTER_GUEST_MODEL_ALLOWLIST', ''],
  ['OPENROUTER_GUEST_MODEL_ALLOWLIST', 'unreviewed/model'],
  ['OPENROUTER_PROVIDER_ALLOWLIST', 'unreviewed-provider'],
])('fails closed on guest policy refusal %s with a real alias adapter', async (key, value) => {
  vi.stubEnv(key, value);
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task: 'concierge' })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('uses the exact guarded guest chain even without a dedicated router key', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', '');
  const { routedCompletion } = await import('./modelRouter');
  await routedCompletion(messages, {}, { task: 'concierge' });
  const init = fetcher.mock.calls[0][1];
  const body = JSON.parse(init.body);
  expect(init.method).toBe('POST');
  expect(init.redirect).toBe('error');
  expect(init.cache).toBe('no-store');
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.headers['X-OpenRouter-ZDR']).toBe('true');
  expect(body.provider.only).toEqual(['openai', 'google-vertex']);
  expect(body.models).toEqual(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
  expect(JSON.stringify(body.messages)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
});

it('direct adapter cannot silently bypass guest external opt-out', async () => {
  vi.stubEnv('OPENROUTER_CONCIERGE_ENABLED', 'false');
  const { openaiProvider } = await import('@/lib/ai/openai');
  await expect(openaiProvider.generate(messages)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('direct adapter uses the protected boundary when routing is allowed', async () => {
  const { openaiProvider } = await import('@/lib/ai/openai');
  await openaiProvider.generate(messages);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.provider.zdr).toBe(true);
  expect(body.models).toEqual(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
  expect(JSON.stringify(body.messages)).not.toContain('4321');
});

it('derives OpenRouter safeguards from the destination even with a false plan flag', async () => {
  const { generatePlannedCompletion } = await import('./transport');
  await generatePlannedCompletion({
    baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'synthetic-alias',
    models: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'], openRouter: false,
  }, messages);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const init = fetcher.mock.calls[0][1];
  const body = JSON.parse(init.body);
  expect(init.headers['X-OpenRouter-ZDR']).toBe('true');
  expect(body.provider.zdr).toBe(true);
  expect(body.provider.only).toEqual(['openai', 'google-vertex']);
  expect(body.models).toEqual(['google/gemini-2.5-flash', 'openai/gpt-4o-mini']);
  expect(JSON.stringify(body.messages)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
});

it.each([
  ['OPENROUTER_GUEST_MODEL_ALLOWLIST', ''],
  ['OPENROUTER_PROVIDER_ALLOWLIST', 'unreviewed-provider'],
])('direct credential alias also rejects %s policy denial', async (key, value) => {
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv(key, value);
  const { openaiProvider } = await import('@/lib/ai/openai');
  await expect(openaiProvider.generate(messages)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps a genuinely separate configured primary without aliasing guest opt-out', async () => {
  vi.stubEnv('AI_BASE_URL', 'https://api.openai.com/v1');
  vi.stubEnv('AI_CHAT_MODEL', 'gpt-4o-mini');
  vi.stubEnv('OPENROUTER_CONCIERGE_ENABLED', 'false');
  const { routedCompletion } = await import('./modelRouter');
  await routedCompletion(messages, {}, { task: 'concierge' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.provider).toBeUndefined();
  expect(JSON.stringify(body.messages)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
});

it('does not rescue residual PII refusal with any second adapter', async () => {
  vi.doMock('@/lib/ai/redaction', async (original) => ({
    ...await original<typeof import('@/lib/ai/redaction')>(),
    contentContainsLikelyPII: () => true,
  }));
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task: 'concierge' })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['extraction', 'brain_ops', 'concierge_complex'] as const)('rejects cheap and empty configured %s models before fetch', async (task) => {
  const name = task === 'extraction' ? 'OPENROUTER_MODEL_EXTRACTION'
    : task === 'brain_ops' ? 'OPENROUTER_MODEL_BRAIN_OPS' : 'OPENROUTER_MODEL_CONCIERGE_COMPLEX';
  for (const model of ['openai/gpt-4o-mini', 'google/gemini-2.5-flash', 'anthropic/claude-haiku-4.5', '']) {
    vi.stubEnv(name, model);
    vi.resetModules();
    const { routedCompletion } = await import('./modelRouter');
    await expect(routedCompletion(messages, {}, { task })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  }
});

it.each(['unreviewed/model', 'openai/gpt-4o-mini', ''])('rejects a strong response outside the resolved model contract: %s', async (actual) => {
  fetcher.mockResolvedValue(response(actual));
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task: 'extraction' })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('accepts only allowed routine failover model responses', async () => {
  fetcher.mockResolvedValue(response('openai/gpt-4o-mini'));
  const { routedCompletion } = await import('./modelRouter');
  expect((await routedCompletion(messages, {}, { task: 'concierge' })).model).toBe('openai/gpt-4o-mini');
  fetcher.mockResolvedValue(response('anthropic/claude-haiku-4.5'));
  await expect(routedCompletion(messages, {}, { task: 'concierge' })).rejects.toThrow();
});

it('shares the active direct extraction model contract, ignoring a production dev flag', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('AI_BASE_URL', 'https://api.openai.com/v1');
  vi.stubEnv('AI_EXTRACTION_MODEL', 'gpt-4o-2024-08-06');
  vi.stubEnv('AI_DEV_FALLBACK', 'true');
  const router = await import('./modelRouter');
  const result = await router.routedCompletion(messages, {}, { task: 'extraction' });
  expect(result.model).toBe('gpt-4o-2024-08-06');
  expect(() => router.assertResolvedTaskModel('extraction', result.model)).not.toThrow();
  expect(() => router.assertResolvedTaskModel('extraction', 'gpt-4o-mini')).toThrow();
});

it.each(['extraction', 'brain_ops', 'concierge_complex'] as const)('rejects lightweight direct %s overrides too', async (task) => {
  vi.stubEnv('OPENROUTER_API_KEY', '');
  const name = task === 'extraction' ? 'AI_EXTRACTION_MODEL'
    : task === 'brain_ops' ? 'AI_BRAIN_MODEL' : 'AI_CONCIERGE_COMPLEX_MODEL';
  vi.stubEnv(name, 'openai/gpt-4o-mini');
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task })).rejects.toThrow('ai_policy_refused');
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects truncated completion output rather than treating it as a successful strong response', async () => {
  fetcher.mockResolvedValue(Response.json({
    model: 'openai/gpt-4o', choices: [{ message: { content: 'Partial answer' }, finish_reason: 'length' }],
  }));
  const { routedCompletion } = await import('./modelRouter');
  await expect(routedCompletion(messages, {}, { task: 'extraction' })).rejects.toThrow('ai_invalid_response');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['malformed', 'network'])('sanitizes %s errors before callers can log them', async (kind) => {
  fetcher.mockImplementation(async () => {
    if (kind === 'network') throw new Error(privateText);
    return new Response(privateText, { status: 200 });
  });
  const { routedCompletion } = await import('./modelRouter');
  const error = await routedCompletion(messages, {}, { task: 'extraction' }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
});

it('selects embedding credentials independently and sanitizes query and document inputs', async () => {
  vi.stubEnv('AI_API_KEY', '');
  fetcher.mockResolvedValue(Response.json({
    data: [{ index: 1, embedding: vector() }, { index: 0, embedding: vector() }],
  }));
  const { getAIProvider } = await import('@/lib/ai');
  const result = await getAIProvider().embed([privateText, `Approved note: ${privateText}`]);
  expect(result).toHaveLength(2);
  const init = fetcher.mock.calls[0][1];
  expect(init.headers.Authorization).toBe('Bearer synthetic-embed');
  expect(JSON.stringify(JSON.parse(init.body).input)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
});

it('active guest retrieval reaches the same redacted real embedding adapter', async () => {
  fetcher.mockResolvedValue(Response.json({ data: [{ index: 0, embedding: vector() }] }));
  const { retrieveGuestChunks } = await import('@/lib/guest/concierge');
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const admin = { rpc } as unknown as Parameters<typeof retrieveGuestChunks>[0];
  expect(await retrieveGuestChunks(admin, 'synthetic-property', privateText)).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/embeddings');
  expect(JSON.stringify(JSON.parse(fetcher.mock.calls[0][1].body).input)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
  expect(rpc).toHaveBeenCalledWith('match_property_chunks', expect.objectContaining({ p_guest_only: true }));
});

it.each(['malformed', 'network'])('embedding %s errors are safe for caller logging', async (kind) => {
  fetcher.mockImplementation(async () => {
    if (kind === 'network') throw new Error(privateText);
    return new Response(privateText, { status: 200 });
  });
  const { openaiProvider } = await import('@/lib/ai/openai');
  const error = await openaiProvider.embed([privateText]).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/synthetic.person|4321|SyntheticCanary/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  [], [{ index: 0, embedding: vector() }, { index: 0, embedding: vector() }],
  [{ index: 1, embedding: vector() }], [{ index: -1, embedding: vector() }],
  [{ index: 0.5, embedding: vector() }], [{ index: 0, embedding: [0.1] }],
  [{ index: 0, embedding: Array(1536).fill(null) }],
  [{ index: 0, embedding: Array(1536).fill(Infinity) }],
  [{ index: 0, embedding: Array(1536).fill('0.1') }],
].map((data) => ({ data })))('rejects invalid embedding count/index/dimension/values %#', async ({ data }) => {
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ data }) });
  const { openaiProvider } = await import('@/lib/ai/openai');
  await expect(openaiProvider.embed(['Synthetic nonprivate text'])).rejects.toThrow();
});

it('fails before embedding request when only the unrelated chat key exists', async () => {
  vi.stubEnv('AI_EMBED_API_KEY', '');
  const { openaiProvider } = await import('@/lib/ai/openai');
  await expect(openaiProvider.embed(['Synthetic text'])).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
