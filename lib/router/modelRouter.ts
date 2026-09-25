import 'server-only';
import { getAIProvider } from '@/lib/ai';
import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { redactPII, redactMessages, contentContainsLikelyPII } from '@/lib/ai/redaction';
import { providerBlock, routineGuestModelChain, ProviderIneligibleError } from '@/lib/router/providerAllowlist';
import { GatewayUnavailableError, outageFallback, unavailableFromStatus } from '@/lib/router/outageFallback';

export { redactPII };
export type TaskType = 'extraction' | 'brain_ops' | 'concierge' | 'concierge_complex' | 'classification' | 'general';

export function classifyTask(hint: string): TaskType {
  const h = hint.toLowerCase();
  if (/\b(brain|knowledge base|proposal|section routing)\b/.test(h)) return 'brain_ops';
  if (/\b(normali[sz]e|extract|structur|json|schema)\b/.test(h)) return 'extraction';
  if (/\b(concierge|guest|answer|chat|reply)\b/.test(h)) {
    return /\b(complex|advanced|safety|emergency)\b/.test(h) ? 'concierge_complex' : 'concierge';
  }
  if (/\b(classif|intent|categor|label)\b/.test(h)) return 'classification';
  return 'general';
}

export interface RouteOptions { task?: TaskType }
export type RouterEnv = Pick<typeof serverEnv,
  | 'openrouterApiKey' | 'openrouterModel' | 'openrouterBaseUrl'
  | 'openrouterModelExtraction' | 'openrouterModelBrainOps'
  | 'openrouterModelClassification' | 'openrouterModelConcierge'
  | 'openrouterModelGeneral' | 'openrouterConciergeEnabled'
  | 'openrouterGuestModelAllowlist' | 'openrouterProviderAllowlist'
> & { openrouterModelConciergeComplex?: string };

export function modelForTask(task: TaskType, env: RouterEnv = serverEnv): string {
  switch (task) {
    case 'extraction': return env.openrouterModelExtraction;
    case 'brain_ops': return env.openrouterModelBrainOps;
    case 'classification': return env.openrouterModelClassification;
    case 'concierge': return env.openrouterModelConcierge;
    case 'concierge_complex': return env.openrouterModelConciergeComplex || env.openrouterModelBrainOps;
    case 'general': default: return env.openrouterModelGeneral;
  }
}

const TASK_FALLBACKS: Record<TaskType, readonly string[]> = {
  extraction: [], brain_ops: [], concierge_complex: [],
  classification: ['openai/gpt-4o-mini'],
  concierge: ['openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
  general: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
};

export function modelChainForTask(task: TaskType, env: RouterEnv = serverEnv): string[] {
  if (task === 'concierge') return routineGuestModelChain(env);
  const primary = modelForTask(task, env);
  return [primary, ...TASK_FALLBACKS[task].filter((model) => model !== primary)];
}

export function shouldRouteExternally(task: TaskType, env: RouterEnv = serverEnv): boolean {
  if (!env.openrouterApiKey) return false;
  if (task === 'concierge' || task === 'concierge_complex') return env.openrouterConciergeEnabled;
  return true;
}

export class ExternalRouteRefused extends Error {
  constructor(message: string) { super(message); this.name = 'ExternalRouteRefused'; }
}
export { PROVIDER_ROUTING_POLICY as ZDR_PROVIDER_RESTRICTION } from '@/lib/router/providerAllowlist';
export { ProviderIneligibleError } from '@/lib/router/providerAllowlist';

export function assertNoResidualPII(messages: AIMessage[]): void {
  if (messages.some((message) => contentContainsLikelyPII(message.content))) {
    throw new ExternalRouteRefused('redacted payload still contains likely PII');
  }
}

function requiresStrongTier(task: TaskType): boolean {
  return task === 'brain_ops' || task === 'extraction' || task === 'concierge_complex';
}

async function openrouterGenerate(
  messages: AIMessage[], opts: GenerateOptions | undefined, task: TaskType,
  endpoint?: { baseUrl: string; apiKey: string; model: string },
): Promise<GenerateResult> {
  const url = `${(endpoint?.baseUrl ?? serverEnv.openrouterBaseUrl).replace(/\/$/, '')}/chat/completions`;
  const chain = endpoint ? [endpoint.model] : modelChainForTask(task, serverEnv);
  const model = chain[0];
  const redacted = redactMessages(messages);
  assertNoResidualPII(redacted);
  const provider = providerBlock(serverEnv);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST', redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint?.apiKey ?? serverEnv.openrouterApiKey}`,
        'X-OpenRouter-ZDR': 'true',
      },
      body: JSON.stringify({
        model, models: chain, messages: redacted,
        temperature: opts?.temperature ?? 0.3, max_tokens: opts?.maxTokens ?? 600, provider,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (!requiresStrongTier(task)) {
      if (error instanceof TypeError) throw new GatewayUnavailableError('network');
      if (error instanceof Error && error.name === 'TimeoutError') throw new GatewayUnavailableError('timeout');
    }
    throw error;
  }
  if (!res.ok) {
    // Strong tasks keep their existing visible failure and no-downgrade contract.
    if (!requiresStrongTier(task)) {
      const unavailable = unavailableFromStatus(res.status);
      if (unavailable) throw unavailable;
    }
    throw new Error(`OpenRouter request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>; model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!json.choices?.[0]?.message?.content?.trim()) throw new Error('Model returned an empty response.');
  return {
    text: json.choices[0].message.content, model: json.model ?? model,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

async function configuredStrongCompletion(
  messages: AIMessage[], opts: GenerateOptions | undefined, task: TaskType,
): Promise<GenerateResult> {
  if (!serverEnv.aiApiKey) throw new Error('High-reliability AI provider is not configured.');
  const model = task === 'concierge_complex' ? serverEnv.aiConciergeComplexModel
    : task === 'extraction' ? serverEnv.aiExtractionModel : serverEnv.aiBrainModel;
  const endpoint = { baseUrl: serverEnv.aiBaseUrl, apiKey: serverEnv.aiApiKey, model };
  if (new URL(endpoint.baseUrl).hostname === 'openrouter.ai') {
    return openrouterGenerate(messages, opts, task, endpoint);
  }
  const redacted = redactMessages(messages);
  assertNoResidualPII(redacted);
  const response = await fetch(`${endpoint.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({
      model, messages: redacted, temperature: opts?.temperature ?? 0.1,
      max_tokens: opts?.maxTokens ?? 600,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`High-reliability AI request failed (${response.status}).`);
  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Model returned an empty response.');
  return {
    text, model: result.model ?? model,
    usage: { promptTokens: result.usage?.prompt_tokens ?? 0, completionTokens: result.usage?.completion_tokens ?? 0 },
  };
}

function hasIndependentLegacyProvider(): boolean {
  if (!serverEnv.aiApiKey) {
    return process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';
  }
  try { return new URL(serverEnv.aiBaseUrl).hostname !== 'openrouter.ai'; }
  catch { return false; }
}

export async function routedCompletion(
  messages: AIMessage[], opts?: GenerateOptions, route?: RouteOptions,
): Promise<GenerateResult> {
  const task: TaskType = route?.task ?? 'general';
  if (!shouldRouteExternally(task, serverEnv)) {
    if (requiresStrongTier(task)) return configuredStrongCompletion(messages, opts, task);
    return getAIProvider().generate(messages, opts);
  }
  try {
    return await openrouterGenerate(messages, opts, task);
  } catch (error) {
    if (requiresStrongTier(task)) {
      log.warn('high_reliability_route_failed', {
        task, code: error instanceof ProviderIneligibleError ? error.code : 'unavailable',
      });
      throw error;
    }
    if (error instanceof GatewayUnavailableError) {
      if (process.env.AI_FAILOVER_ENABLED === 'true' &&
          (task === 'general' || task === 'classification')) {
        return outageFallback(task, messages, opts, error);
      }
      if (hasIndependentLegacyProvider()) return getAIProvider().generate(messages, opts);
      throw error;
    }
    if (error instanceof ProviderIneligibleError || error instanceof ExternalRouteRefused) {
      log.warn('openrouter_route_refused', {
        task, code: error instanceof ProviderIneligibleError ? error.code : 'residual_pii',
      });
      if (hasIndependentLegacyProvider()) return getAIProvider().generate(messages, opts);
    }
    // Authentication, invalid input and provider policy errors are not outages.
    throw error;
  }
}
