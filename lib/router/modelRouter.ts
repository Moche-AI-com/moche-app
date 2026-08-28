import 'server-only';
import { getAIProvider } from '@/lib/ai';
import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { redactPII, redactMessages, contentContainsLikelyPII } from '@/lib/ai/redaction';
import {
  providerBlock,
  routineGuestModelChain,
  ProviderIneligibleError,
} from '@/lib/router/providerAllowlist';

// PII redaction lives in lib/ai/redaction.ts (single source of truth). Re-exported
// here so existing importers of `@/lib/router/modelRouter` keep working unchanged.
export { redactPII };

// Coarse task taxonomy used to decide how a completion should be routed. Each task
// maps to a cost/quality-appropriate model tier (see modelForTask) and to whether the
// external route is eligible at all (see shouldRouteExternally).
//
// `brain_ops` (2026-08-28) covers brain management: routing knowledge to the right
// section, cleanup/normalization, and AI-update merge decisions. The owner directive
// is that this work runs on the most reliable configured model, so like `extraction`
// it has no cheaper in-router fallback.
export type TaskType = 'extraction' | 'brain_ops' | 'concierge' | 'classification' | 'general';

// Classify a unit of work from a short caller-supplied hint. Purely heuristic and
// side-effect free; it never calls a model. Callers that already know the task type
// can pass it straight through to routedCompletion instead.
export function classifyTask(hint: string): TaskType {
  const h = hint.toLowerCase();
  // Brain management first: hints like "normalize + route into the brain" must not be
  // claimed by the cheaper extraction/classification patterns below.
  if (/\b(brain|knowledge base|proposal|section routing)\b/.test(h)) return 'brain_ops';
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

// The slice of server env this router reads. Injectable so the pure routing helpers
// (modelForTask / shouldRouteExternally) are unit-testable without touching real env.
export type RouterEnv = Pick<
  typeof serverEnv,
  | 'openrouterApiKey'
  | 'openrouterModel'
  | 'openrouterBaseUrl'
  | 'openrouterModelExtraction'
  | 'openrouterModelBrainOps'
  | 'openrouterModelClassification'
  | 'openrouterModelConcierge'
  | 'openrouterModelGeneral'
  | 'openrouterConciergeEnabled'
  | 'openrouterGuestModelAllowlist'
  | 'openrouterProviderAllowlist'
>;

// Per-task model tier. Falls back to the legacy `openrouterModel` default only via the
// per-tier env defaults (see lib/env.ts), so an unset tier still resolves to a slug.
export function modelForTask(task: TaskType, env: RouterEnv = serverEnv): string {
  switch (task) {
    case 'extraction':
      return env.openrouterModelExtraction;
    case 'brain_ops':
      return env.openrouterModelBrainOps;
    case 'classification':
      return env.openrouterModelClassification;
    case 'concierge':
      return env.openrouterModelConcierge;
    case 'general':
    default:
      return env.openrouterModelGeneral;
  }
}

// Secondary models per task, tried by OpenRouter itself (via the `models` array) if the
// primary tier is unavailable, rate-limited, or errors. This is the FIRST resilience
// layer and is much faster than falling all the way back to our in-house provider.
// Every slug here has been verified to resolve under ZDR_PROVIDER_RESTRICTION.
// Order matters: cheapest capable model first. The in-house provider remains the final
// backstop if the whole OpenRouter request fails (see routedCompletion).
const TASK_FALLBACKS: Record<TaskType, readonly string[]> = {
  // Extraction has NO lower-tier in-router fallback on purpose. Its highest-stakes
  // caller is property onboarding, where the output becomes canonical Brain content
  // after host review. A silent downgrade to a cheaper model would turn weak output
  // into guest-facing truth, so if the strong tier is unavailable the request fails
  // and the caller surfaces a try-again / manual-entry path instead.
  extraction: [],
  // Brain ops shares extraction's no-downgrade rule, for the same reason: its output
  // (section routing, normalized knowledge, update-merge decisions) becomes canonical
  // Brain content after host review. A cheap-tier misroute misfiles knowledge the
  // concierge then grounds on, degrading every future guest answer.
  brain_ops: [],
  classification: ['openai/gpt-4o-mini'],
  concierge: ['openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
  general: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
};

// Full ordered model chain for a task.
//
// `concierge` is the routine-guest route and is governed by the reviewed allowlist
// (directive §0.2 row 3) rather than by the per-tier env slug: only slugs a human
// reviewed may answer a guest, and an empty allowlist throws ProviderIneligibleError
// so the caller fails closed to the in-house provider instead of picking a default.
//
// Every other task keeps the configured primary tier plus its verified fallbacks,
// de-duplicated so an override matching a fallback slug is not sent twice.
export function modelChainForTask(task: TaskType, env: RouterEnv = serverEnv): string[] {
  if (task === 'concierge') return routineGuestModelChain(env);
  const primary = modelForTask(task, env);
  return [primary, ...TASK_FALLBACKS[task].filter((m) => m !== primary)];
}

// Whether a given task is eligible to leave our infra for OpenRouter.
//   - No API key  → never (behaves exactly like today: in-house OpenAI provider).
//   - concierge   → only when explicitly enabled; guest-facing answers stay in-house
//                   by default so we never send guest conversations to a third party
//                   without an intentional opt-in.
//   - other tasks → eligible as soon as a key is present. Brain-ops payloads are
//                   host-authored knowledge, and the external path still gets PII
//                   redaction + the ZDR provider restriction + the residual-PII check.
export function shouldRouteExternally(task: TaskType, env: RouterEnv = serverEnv): boolean {
  if (!env.openrouterApiKey) return false;
  if (task === 'concierge') return env.openrouterConciergeEnabled;
  return true;
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

// The hardened provider restriction now lives in lib/router/providerAllowlist as
// PROVIDER_ROUTING_POLICY, corrected to directive §1's exact field set (adds
// `require_parameters` and the nested `sort: { by, partition }`; `partition: 'model'`
// is what actually prevents routing from drifting off the reviewed model).
//
// Re-exported under the old name so existing importers and tests keep working.
export { PROVIDER_ROUTING_POLICY as ZDR_PROVIDER_RESTRICTION } from '@/lib/router/providerAllowlist';
export { ProviderIneligibleError } from '@/lib/router/providerAllowlist';

// Defense-in-depth: after redaction, refuse the external route if any message content
// still trips the PII detector. Multimodal messages are scanned on their text parts
// only — image parts are CDN URLs, not guest text. Pure + exported so the guarantee
// is directly testable.
export function assertNoResidualPII(messages: AIMessage[]): void {
  if (messages.some((m) => contentContainsLikelyPII(m.content))) {
    throw new ExternalRouteRefused('redacted payload still contains likely PII');
  }
}

async function openrouterGenerate(
  messages: AIMessage[],
  opts: GenerateOptions | undefined,
  task: TaskType,
): Promise<GenerateResult> {
  const url = `${serverEnv.openrouterBaseUrl.replace(/\/$/, '')}/chat/completions`;
  const chain = modelChainForTask(task, serverEnv);
  const model = chain[0];
  // Redact BEFORE anything leaves our infra, then run a post-redaction sanity
  // check. If PII survived redaction, refuse the external route entirely rather
  // than risk sending it — the caller falls back to the in-house provider.
  const redacted = redactMessages(messages);
  assertNoResidualPII(redacted);
  // Resolved before the request is built, not inline in the body, so a policy refusal is
  // visibly a pre-flight check rather than something that happens to throw during
  // argument evaluation. Either way no request is issued, but only one of those reads as
  // deliberate to the next person who edits this call.
  const provider = providerBlock(serverEnv);
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
      // `models` (ordered) asks OpenRouter to try the next slug in the chain if the
      // primary is down/rate-limited, giving in-router failover before we fall all the
      // way back to the in-house provider. `model` is kept for older-client parity.
      model,
      models: chain,
      messages: redacted,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 600,
      // Provider-level hardened ZDR restriction per OpenRouter's API (header + body,
      // belt & braces). See ZDR_PROVIDER_RESTRICTION for the rationale of each flag.
      provider,
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
    model: json.model ?? model,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

// Generate a completion, optionally routed through OpenRouter per task tier.
//
// DEFAULT (no OPENROUTER_API_KEY): identical to today — delegates straight to the
// existing OpenAI provider with the original, un-redacted messages, for every task.
//
// When OPENROUTER_API_KEY is set: eligible tasks (see shouldRouteExternally — concierge
// stays in-house unless explicitly enabled) are routed to the task's model tier. PII is
// redacted, a hardened Zero-Data-Retention restriction is set on the request, and a
// post-redaction sanity check runs. If PII survives redaction the external route is
// REFUSED (ExternalRouteRefused). Any failure — refusal, network error, or non-2xx —
// falls back to the in-house provider (with the original messages) so enabling routing
// can never degrade correctness.
export async function routedCompletion(
  messages: AIMessage[],
  opts?: GenerateOptions,
  route?: RouteOptions,
): Promise<GenerateResult> {
  const task: TaskType = route?.task ?? 'general';
  if (!shouldRouteExternally(task, serverEnv)) {
    return getAIProvider().generate(messages, opts);
  }
  try {
    return await openrouterGenerate(messages, opts, task);
  } catch (e) {
    // provider_ineligible is a policy outcome, not a fault: no reviewed model was
    // eligible, so the external route is refused and the in-house provider answers.
    // Logged distinctly because an operator debugging "why is routing off?" needs to
    // tell a misconfigured allowlist apart from an OpenRouter outage.
    if (e instanceof ProviderIneligibleError) {
      log.warn('openrouter_provider_ineligible', { task, code: e.code, reason: e.message });
      return getAIProvider().generate(messages, opts);
    }
    log.warn('openrouter_route_failed_fallback', { task, error: String(e) });
    return getAIProvider().generate(messages, opts);
  }
}
