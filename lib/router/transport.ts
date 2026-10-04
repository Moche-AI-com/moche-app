import 'server-only';
import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { redactMessages, contentContainsLikelyPII } from '@/lib/ai/redaction';
import { providerBlock } from './providerAllowlist';
import { serverEnv, isProductionRuntime } from '@/lib/env';

export class AITransportError extends Error {
  constructor(readonly code: 'ai_not_configured' | 'ai_policy_refused' | 'ai_unavailable'
    | 'ai_http_error' | 'ai_invalid_json' | 'ai_invalid_response' | 'ai_model_mismatch',
    readonly status?: number,
    readonly outageReason?: 'network' | 'timeout') {
    super(code === 'ai_not_configured' ? 'AI provider is not configured.'
      : `${code}${status !== undefined ? `: ${status}` : ''}`);
    this.name = 'AITransportError';
  }
}

export function endpointIsOpenRouter(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if ((url.protocol !== 'https:' && (isProductionRuntime() || url.protocol !== 'http:'))
      || url.username || url.password || url.search || url.hash) throw new Error();
    return url.hostname === 'openrouter.ai' || url.hostname.endsWith('.openrouter.ai');
  } catch { throw new AITransportError('ai_not_configured'); }
}

/** Never expose fetch/JSON parser exceptions: both can include private response excerpts. */
export async function fetchAIJson(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const reason = error instanceof TypeError ? 'network'
      : error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : undefined;
    throw new AITransportError('ai_unavailable', undefined, reason);
  }
  if (!response.ok) {
    const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? response.status : undefined;
    throw new AITransportError('ai_http_error', status);
  }
  try { return await response.json(); }
  catch { throw new AITransportError('ai_invalid_json'); }
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const tokenCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

/** Exact identity, plus dated snapshots of the same model; never strip vendor identity. */
export function modelMatchesPlan(actual: unknown, planned: readonly string[]): actual is string {
  return typeof actual === 'string' && planned.some((model) => actual === model
    || (actual.startsWith(`${model}-`) && /^\d{4}-\d{2}-\d{2}$/.test(actual.slice(model.length + 1))));
}

export interface CompletionPlan {
  baseUrl: string;
  apiKey: string;
  models: string[];
  openRouter: boolean;
}

/** Single outbound completion boundary for BOTH credential aliases. */
export async function generatePlannedCompletion(
  plan: CompletionPlan, messages: AIMessage[], opts?: GenerateOptions,
): Promise<GenerateResult> {
  if (!plan.apiKey || !plan.models.length) throw new AITransportError('ai_not_configured');
  const openRouter = endpointIsOpenRouter(plan.baseUrl) || plan.openRouter;
  const redacted = redactMessages(messages);
  if (redacted.some((message) => contentContainsLikelyPII(message.content))) {
    throw new AITransportError('ai_policy_refused');
  }
  const provider = openRouter ? providerBlock(serverEnv) : undefined;
  const json = asRecord(await fetchAIJson(`${plan.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${plan.apiKey}`,
      ...(openRouter ? { 'X-OpenRouter-ZDR': 'true' } : {}),
    },
    body: JSON.stringify({
      model: plan.models[0], ...(openRouter ? { models: plan.models, provider } : {}),
      messages: redacted, temperature: opts?.temperature ?? 0.3, max_tokens: opts?.maxTokens ?? 600,
    }),
  }));
  const choice = asRecord(Array.isArray(json.choices) ? json.choices[0] : undefined);
  const text = asRecord(choice.message).content;
  if (typeof text !== 'string' || !text.trim()
    || (choice.finish_reason != null && choice.finish_reason !== 'stop')) {
    throw new AITransportError('ai_invalid_response');
  }
  if (!modelMatchesPlan(json.model, plan.models)) throw new AITransportError('ai_model_mismatch');
  const usage = asRecord(json.usage);
  return {
    text, model: json.model,
    usage: { promptTokens: tokenCount(usage.prompt_tokens), completionTokens: tokenCount(usage.completion_tokens) },
  };
}
