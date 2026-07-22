import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  classifyTask,
  modelForTask,
  shouldRouteExternally,
  assertNoResidualPII,
  ExternalRouteRefused,
  ZDR_PROVIDER_RESTRICTION,
  redactPII,
  type RouterEnv,
  type TaskType,
} from './modelRouter';
import type { ChatMessage } from '@/lib/ai/provider';

// --- Fixtures ---------------------------------------------------------------

// A fully-populated RouterEnv with a key set and concierge OFF (production default).
function routerEnv(over: Partial<RouterEnv> = {}): RouterEnv {
  return {
    openrouterApiKey: 'test-key',
    openrouterModel: 'openai/gpt-4o-mini',
    openrouterBaseUrl: 'https://openrouter.ai/api/v1',
    openrouterModelExtraction: 'openai/gpt-4o-mini',
    openrouterModelClassification: 'meta-llama/llama-3.1-8b-instruct',
    openrouterModelConcierge: 'anthropic/claude-haiku-4.5',
    openrouterModelGeneral: 'openai/gpt-4o-mini',
    openrouterConciergeEnabled: false,
    ...over,
  };
}

// --- Pure helpers -----------------------------------------------------------

describe('classifyTask', () => {
  it('detects extraction hints', () => {
    expect(classifyTask('normalize this note into JSON')).toBe('extraction');
    expect(classifyTask('extract the schema')).toBe('extraction');
  });
  it('detects concierge hints', () => {
    expect(classifyTask('answer the guest chat reply')).toBe('concierge');
  });
  it('detects classification hints', () => {
    expect(classifyTask('classify the intent / label')).toBe('classification');
  });
  it('falls back to general', () => {
    expect(classifyTask('do something unrelated')).toBe('general');
  });
});

describe('modelForTask', () => {
  const env = routerEnv();
  it('maps each task to its tier model', () => {
    expect(modelForTask('extraction', env)).toBe('openai/gpt-4o-mini');
    expect(modelForTask('classification', env)).toBe('meta-llama/llama-3.1-8b-instruct');
    expect(modelForTask('concierge', env)).toBe('anthropic/claude-haiku-4.5');
    expect(modelForTask('general', env)).toBe('openai/gpt-4o-mini');
  });
  it('honors per-tier overrides', () => {
    const custom = routerEnv({ openrouterModelExtraction: 'custom/extract-model' });
    expect(modelForTask('extraction', custom)).toBe('custom/extract-model');
  });
});

describe('shouldRouteExternally', () => {
  it('is false for every task when no API key is set', () => {
    const env = routerEnv({ openrouterApiKey: '' });
    for (const t of ['extraction', 'classification', 'concierge', 'general'] as TaskType[]) {
      expect(shouldRouteExternally(t, env)).toBe(false);
    }
  });
  it('routes extraction/classification/general when a key is present', () => {
    const env = routerEnv();
    expect(shouldRouteExternally('extraction', env)).toBe(true);
    expect(shouldRouteExternally('classification', env)).toBe(true);
    expect(shouldRouteExternally('general', env)).toBe(true);
  });
  it('keeps concierge in-house by default even with a key', () => {
    expect(shouldRouteExternally('concierge', routerEnv())).toBe(false);
  });
  it('routes concierge only when explicitly enabled', () => {
    expect(shouldRouteExternally('concierge', routerEnv({ openrouterConciergeEnabled: true }))).toBe(true);
  });
});

describe('assertNoResidualPII', () => {
  it('passes for clean content', () => {
    expect(() => assertNoResidualPII([{ role: 'user', content: 'the wifi works great' }])).not.toThrow();
  });
  it('throws ExternalRouteRefused when raw PII survives', () => {
    const msgs: ChatMessage[] = [{ role: 'user', content: 'email me at raw@example.com' }];
    expect(() => assertNoResidualPII(msgs)).toThrow(ExternalRouteRefused);
  });
  it('passes once the same content is redacted', () => {
    const redacted = redactPII('email me at raw@example.com');
    expect(() => assertNoResidualPII([{ role: 'user', content: redacted }])).not.toThrow();
  });
});

describe('ZDR_PROVIDER_RESTRICTION', () => {
  it('is hardened: zdr on, data collection denied, no fallbacks', () => {
    expect(ZDR_PROVIDER_RESTRICTION).toEqual({ zdr: true, data_collection: 'deny', allow_fallbacks: false });
  });
});

// --- Integration: routedCompletion (env-dependent) --------------------------
// serverEnv is captured at import time from process.env, so each scenario stubs
// env, resets the module registry, and re-imports a fresh router instance.

type FetchResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

function okResponse(model = 'router/echo', content = 'external-answer'): FetchResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      model,
      usage: { prompt_tokens: 7, completion_tokens: 9 },
    }),
  };
}

async function loadRouter(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./modelRouter');
}

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'you are helpful' },
  { role: 'user', content: 'summarize the house rules' },
];

function lastBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('routedCompletion', () => {
  beforeEach(() => {
    // Keep test env out of production mode and off the real OpenAI provider so the
    // in-house path deterministically resolves to the dev fallback provider.
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('AI_API_KEY', '');
    vi.stubEnv('AI_DEV_FALLBACK', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('with NO key: uses the in-house provider and never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: '' });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'extraction' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.model).toBe('dev-fallback-chat');
  });

  it('with key + extraction: routes to gpt-4o-mini with hardened ZDR', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse('openai/gpt-4o-mini'));
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'extraction' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody(fetchMock);
    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.provider).toEqual({ zdr: true, data_collection: 'deny', allow_fallbacks: false });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['X-OpenRouter-ZDR']).toBe('true');
    expect(res.text).toBe('external-answer');
  });

  it('with key + classification: routes to the llama tier', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    await routedCompletion(MESSAGES, undefined, { task: 'classification' });
    expect(lastBody(fetchMock).model).toBe('meta-llama/llama-3.1-8b-instruct');
  });

  it('with key + general (default task): routes to gpt-4o-mini', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    await routedCompletion(MESSAGES); // no route → 'general'
    expect(lastBody(fetchMock).model).toBe('openai/gpt-4o-mini');
  });

  it('with key + concierge (default): stays in-house, no fetch', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'concierge' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.model).toBe('dev-fallback-chat');
  });

  it('with key + concierge enabled: routes to the haiku tier', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse('anthropic/claude-haiku-4.5'));
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_CONCIERGE_ENABLED: 'true',
    });

    await routedCompletion(MESSAGES, undefined, { task: 'concierge' });
    expect(lastBody(fetchMock).model).toBe('anthropic/claude-haiku-4.5');
  });

  it('honors a per-tier env override', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_MODEL_EXTRACTION: 'custom/extract-v2',
    });

    await routedCompletion(MESSAGES, undefined, { task: 'extraction' });
    expect(lastBody(fetchMock).model).toBe('custom/extract-v2');
  });

  it('redacts message content before it leaves our infra', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    await routedCompletion(
      [{ role: 'user', content: 'reach me at guest@example.com' }],
      undefined,
      { task: 'extraction' },
    );

    const body = lastBody(fetchMock) as { messages: Array<{ content: string }> };
    expect(body.messages[0].content).not.toContain('guest@example.com');
    expect(body.messages[0].content).toContain('[redacted-email]');
  });

  it('falls back to in-house on a non-2xx response', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'extraction' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.model).toBe('dev-fallback-chat');
  });

  it('falls back to in-house on a network error', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'extraction' });
    expect(res.model).toBe('dev-fallback-chat');
  });
});
