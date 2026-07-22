import 'server-only';
import { getAIProvider } from '@/lib/ai';
import type { ChatMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';

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

// Redact obvious PII / secrets before any content leaves our infrastructure for an
// external router (OpenRouter). Conservative by design: it is only applied on the
// external path, never to the default in-house OpenAI provider call. Mirrors the
// logger's redaction so we stay consistent about what "sensitive" means.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const LONG_DIGITS_RE = /\b\d{5,}\b/g;
const SECRET_LABEL_RE = /\b(password|passcode|pass code|access code|door code|wifi password|pin)\b\s*[:=-]?\s*\S+/gi;

export function redactPII(text: string): string {
  return text
    .replace(SECRET_LABEL_RE, (_m, label: string) => `${label}: [redacted]`)
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, '').length >= 8 ? '[redacted-phone]' : m))
    .replace(LONG_DIGITS_RE, (m) => `***${m.slice(-2)}`);
}

export interface RouteOptions {
  task?: TaskType;
}

async function openrouterGenerate(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
  const url = `${serverEnv.openrouterBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const redacted = messages.map((m) => ({ role: m.role, content: redactPII(m.content) }));
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.openrouterApiKey}`,
    },
    body: JSON.stringify({
      model: serverEnv.openrouterModel,
      messages: redacted,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 600,
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
// When OPENROUTER_API_KEY is set: PII is redacted and the request is sent to
// OPENROUTER_MODEL. Any failure falls back to the in-house provider (with the
// original messages) so enabling routing can never degrade correctness.
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
