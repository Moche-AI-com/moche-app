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
    openrouterModelExtraction: 'openai/gpt-4o',
    openrouterModelClassification: 'meta-llama/llama-3.1-8b-instruct',
    openrouterModelConcierge: 'anthropic/claude-haiku-4.5',
    openrouterModelGeneral: 'openai/gpt-4o-mini',
    openrouterConciergeEnabled: false,
    openrouterGuestModelAllowlist:
      'google/gemini-2.5-flash,openai/gpt-4o-mini,anthropic/claude-haiku-4.5',
    openrouterProviderAllowlist: 'azure,google-vertex,openai,anthropic',
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
    expect(modelForTask('extraction', env)).toBe('openai/gpt-4o');
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
  // Corrected to directive §1: `require_parameters` and the nested `sort` are part of
  // the mandated block, and `allow_fallbacks` is true because zdr + data_collection
  // (plus `provider.only`, when configured) already bound what a fallback can be.
  // Field-for-field assertions live in providerAllowlist.test.ts.
  it('is hardened: zdr on, data collection denied, parameters required', () => {
    expect(ZDR_PROVIDER_RESTRICTION).toEqual({
      require_parameters: true,
      zdr: true,
      data_collection: 'deny',
      allow_fallbacks: true,
      sort: { by: 'latency', partition: 'model' },
    });
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

  it('with key + extraction: routes to the strong tier with hardened ZDR', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse('openai/gpt-4o'));
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'extraction' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastBody(fetchMock);
    expect(body.model).toBe('openai/gpt-4o');
    expect(body.provider).toEqual({
      require_parameters: true,
      zdr: true,
      data_collection: 'deny',
      allow_fallbacks: true,
      sort: { by: 'latency', partition: 'model' },
      only: ['azure', 'google-vertex', 'openai', 'anthropic'],
    });
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['X-OpenRouter-ZDR']).toBe('true');
    expect(res.text).toBe('external-answer');
  });

  // Onboarding correctness over availability: extraction must never fail over to a
  // cheaper model in-router. If the strong tier is down, the caller surfaces a
  // try-again / manual-entry path rather than saving weak output to the Brain.
  it('sends no lower-tier fallback chain for extraction', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    await routedCompletion(MESSAGES, undefined, { task: 'extraction' });
    expect(lastBody(fetchMock).models).toEqual(['openai/gpt-4o']);
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

  it('with key + concierge enabled: routes to the concierge tier', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse('google/gemini-2.5-flash'));
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_CONCIERGE_ENABLED: 'true',
    });

    await routedCompletion(MESSAGES, undefined, { task: 'concierge' });
    expect(lastBody(fetchMock).model).toBe('google/gemini-2.5-flash');
  });

  it('sends an ordered models[] chain so OpenRouter can fail over in-router', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_CONCIERGE_ENABLED: 'true',
    });

    await routedCompletion(MESSAGES, undefined, { task: 'concierge' });
    const body = lastBody(fetchMock);
    const models = body.models as string[];
    expect(Array.isArray(models)).toBe(true);
    // Primary first, then verified backups; primary must match the single `model` field.
    expect(models[0]).toBe(body.model);
    expect(models.length).toBeGreaterThan(1);
  });

  // The routine-guest chain comes from the reviewed allowlist, in the operator's order,
  // and ignores OPENROUTER_MODEL_CONCIERGE entirely — a per-tier slug is not a review.
  it('builds the concierge chain from the reviewed allowlist, in order, without duplicates', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_GUEST_MODEL_ALLOWLIST: 'openai/gpt-4o-mini,openai/gpt-4o-mini,unreviewed/model',
      // Ignored on the guest route; present to prove the allowlist wins.
      OPENROUTER_MODEL_CONCIERGE: 'anthropic/claude-haiku-4.5',
    });

    await routedCompletion(MESSAGES, undefined, { task: 'concierge' });
    const body = lastBody(fetchMock);
    expect(body.models).toEqual(['openai/gpt-4o-mini']);
    expect(body.model).toBe('openai/gpt-4o-mini');
  });

  // Directive §0.2 row 3 fail-closed path: an empty allowlist must never reach
  // OpenRouter at all, and must not degrade the answer — the in-house provider serves.
  it('refuses the external guest route when the allowlist is empty', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_CONCIERGE_ENABLED: 'true',
      OPENROUTER_GUEST_MODEL_ALLOWLIST: '',
    });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'concierge' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.text).not.toBe('external-answer');
  });

  // The failure this replaces: an all-unreviewed provider env used to drop `only` and
  // still send the request, letting OpenRouter pick any endpoint its own ZDR
  // classification accepted. No request may leave at all in that state.
  it('issues no request when no configured provider is reviewed', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_PROVIDER_ALLOWLIST: 'some-random-host',
    });

    const res = await routedCompletion(MESSAGES, undefined, { task: 'extraction' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.text).not.toBe('external-answer');
  });

  it('always pins `only` on the outbound request', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({ OPENROUTER_API_KEY: 'test-key' });

    await routedCompletion(MESSAGES, undefined, { task: 'extraction' });
    const provider = lastBody(fetchMock).provider as { only?: string[] };
    expect(provider.only).toEqual(['azure', 'google-vertex', 'openai', 'anthropic']);
  });

  // Extraction has no fallbacks by design (see TASK_FALLBACKS), so a per-tier override
  // produces a single-model chain and duplicates are impossible there. Other tiers
  // still carry primary-plus-fallbacks, and a duplicate slug wastes a retry on a
  // model that already failed.
  it('never sends a duplicate slug when a per-tier override equals a fallback', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const { routedCompletion } = await loadRouter({
      OPENROUTER_API_KEY: 'test-key',
      // Deliberately set the primary to one of the general fallbacks.
      OPENROUTER_MODEL_GENERAL: 'google/gemini-2.5-flash',
    });

    await routedCompletion(MESSAGES, undefined, { task: 'general' });

    const models = lastBody(fetchMock).models as string[];
    expect(models[0]).toBe('google/gemini-2.5-flash');
    expect(new Set(models).size).toBe(models.length);
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
