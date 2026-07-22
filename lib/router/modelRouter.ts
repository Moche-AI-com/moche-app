import 'server-only';
import { getAIProvider } from '@/lib/ai';
import type { ChatMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { redactPII, redactMessages, containsLikelyPII } from '@/lib/ai/redaction';

// PII redaction lives in lib/ai/redaction.ts (single source of truth). Re-exported
// here so existing importers of `@/lib/router/modelRouter` keep working unchanged.
export { redactPII };

// Coarse task taxonomy used to decide how a completion should be routed. The POC
// only needs a lightweight signal; richer policies (per-tier model maps, cost caps)
// can hang off this later without touching call sites.
export type TaskType = 'extraction' | 'concierge' | 'classification' | 'general';

// Classify a unit of work from a short caller-supplied hint. Purely heuristic and
// side-effect free; it never calls a model. Callers that already know the task type
// can pass it straight through to routedCompletion instead.
export function classifyTask(hint: string): TaskType {
  const h = hint.toLowerCase();
  if (/\b(normali[sz]e|extract|structur|json|schema)\b/.test(h)) return 'extraction';
  if (/\b(concierge|guest|answer|chat|reply)\b/.test(h)) return 'concierge';
  if (/\b(classif|intent|categor|label)\b/.test(h)) return 'classification';
  return 'general';
}

// Redaction of PII / secrets before content leaves our infrastructure for an
// external router (OpenRouter) is implemented in lib/ai/redaction.ts and imported
// above. It is only applied on the external path, never to the default in-house
// OpenAI provider call.

export interface RouteOptions {
  task?: TaskType;
}

// Thrown when the external (OpenRouter) path is refused because redacted content
// still appears to contain PII. Callers catch this and fall back to the in-house
// provider — a leak is never worth completing the external request.
export class ExternalRouteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExternalRouteRefused';
  }
}

async function openrouterGenerate(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
  const url = `${serverEnv.openrouterBaseUrl.replace(/\/$/, '')}/chat/completions`;
  // Redact BEFORE anything leaves our infra, then run a post-redaction sanity
  // check. If PII survived redaction, refuse the external route entirely rather
  // than risk sending it — the caller falls back to the in-house provider.
  const redacted = redactMessages(messages);
  if (redacted.some((m) => containsLikelyPII(m.content))) {
    throw new ExternalRouteRefused('redacted payload still contains likely PII');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.openrouterApiKey}`,
      // Zero-Data-Retention: instruct OpenRouter (and downstream providers) not to
      // log or retain prompt/response content. Enforced ONLY on the active external
      // path; the default in-house OpenAI call is unaffected. See docs/compliance.
      'X-OpenRouter-ZDR': 'true',
    },
    body: JSON.stringify({
      model: serverEnv.openrouterModel,
      messages: redacted,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 600,
      // Provider-level ZDR flag per OpenRouter's API (header + body, belt & braces).
      provider: { zdr: true },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices[0]?.message?.content ?? '',
    model: json.model ?? serverEnv.openrouterModel,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

// Generate a completion, optionally routed through OpenRouter.
//
// DEFAULT (no OPENROUTER_API_KEY): identical to today — delegates straight to the
// existing OpenAI provider with the original, un-redacted messages.
//
// When OPENROUTER_API_KEY is set: PII is redacted, a Zero-Data-Retention flag is
// set on the request, and a post-redaction sanity check runs. If PII survives
// redaction the external route is REFUSED (ExternalRouteRefused). Any failure —
// refusal, network error, or non-2xx — falls back to the in-house provider (with
// the original messages) so enabling routing can never degrade correctness.
export async function routedCompletion(
  messages: ChatMessage[],
  opts?: GenerateOptions,
  _route?: RouteOptions,
): Promise<GenerateResult> {
  if (!serverEnv.openrouterApiKey) {
    return getAIProvider().generate(messages, opts);
  }
  try {
    return await openrouterGenerate(messages, opts);
  } catch (e) {
    log.warn('openrouter_route_failed_fallback', { error: String(e) });
    return getAIProvider().generate(messages, opts);
  }
}
