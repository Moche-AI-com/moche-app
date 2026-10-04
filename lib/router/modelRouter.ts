import 'server-only';
import { getAIProvider } from '@/lib/ai';
import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { serverEnv, isProductionRuntime } from '@/lib/env';
import { AITransportError, endpointIsOpenRouter, generatePlannedCompletion, modelMatchesPlan, type CompletionPlan } from './transport';
import { log } from '@/lib/log';
import { GatewayUnavailableError, outageFallback, unavailableFromStatus } from './outageFallback';
import { redactPII, contentContainsLikelyPII } from '@/lib/ai/redaction';
import {
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
export type TaskType = 'extraction' | 'brain_ops' | 'concierge' | 'concierge_complex' | 'classification' | 'general';

// Classify a unit of work from a short caller-supplied hint. Purely heuristic and
// side-effect free; it never calls a model. Callers that already know the task type
// can pass it straight through to routedCompletion instead.
export function classifyTask(hint: string): TaskType {
  const h = hint.toLowerCase();
  // Brain management first: hints like "normalize + route into the brain" must not be
  // claimed by the cheaper extraction/classification patterns below.
  if (/\b(brain|knowledge base|proposal|section routing)\b/.test(h)) return 'brain_ops';
  if (/\b(normali[sz]e|extract|structur|json|schema)\b/.test(h)) return 'extraction';
  if (/\b(concierge|guest|answer|chat|reply)\b/.test(h)) {
    return /\b(complex|advanced|safety|emergency)\b/.test(h) ? 'concierge_complex' : 'concierge';
  }
  if (/\b(classif|intent|categor|label)\b/.test(h)) return 'classification';
  return 'general';
}

// Redaction of PII / secrets before content leaves our infrastructure for an
// external router (OpenRouter) is implemented in lib/ai/redaction.ts and imported
// above. Both configured completion destinations and embeddings enforce this boundary.

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
> & { openrouterModelConciergeComplex?: string };

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
    case 'concierge_complex':
      return env.openrouterModelConciergeComplex || env.openrouterModelBrainOps;
    case 'general':
    default:
      return env.openrouterModelGeneral;
  }
}

// Secondary models per task, tried by OpenRouter itself (via the `models` array) if the
// primary tier is unavailable, rate-limited, or errors. Separately opted-in,
// non-guest routine tasks may use the independent protected outage fallback.
// Every slug here has been verified to resolve under ZDR_PROVIDER_RESTRICTION.
// Order matters: cheapest capable model first. An exhausted chain fails closed.
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
  concierge_complex: [],
  classification: ['openai/gpt-4o-mini'],
  concierge: ['openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
  general: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
};

// Full ordered model chain for a task.
//
// `concierge` is the routine-guest route and is governed by the reviewed allowlist
// (directive §0.2 row 3) rather than by the per-tier env slug: only slugs a human
// reviewed may answer a guest, and an empty allowlist throws ProviderIneligibleError
// so the caller refuses remote generation instead of picking a default.
//
// Every other task keeps the configured primary tier plus its verified fallbacks,
// de-duplicated so an override matching a fallback slug is not sent twice.
export function modelChainForTask(task: TaskType, env: RouterEnv = serverEnv): string[] {
  if (task === 'concierge') return routineGuestModelChain(env);
  const primary = modelForTask(task, env);
  return [primary, ...TASK_FALLBACKS[task].filter((m) => m !== primary)];
}

// Whether a task selects the dedicated OpenRouter credential/model configuration.
//   - No API key  → use the configured primary, subject to its actual destination.
//   - concierge   → only when explicitly enabled; an OpenRouter primary alias
//                   cannot bypass this opt-out.
//   - other tasks → eligible as soon as a key is present. Brain-ops payloads are
//                   host-authored knowledge, and the external path still gets PII
//                   redaction + the ZDR provider restriction + the residual-PII check.
export function shouldRouteExternally(task: TaskType, env: RouterEnv = serverEnv): boolean {
  if (!env.openrouterApiKey) return false;
  if (task === 'concierge' || task === 'concierge_complex') return env.openrouterConciergeEnabled;
  return true;
}

// Thrown when the external (OpenRouter) path is refused because redacted content
// still appears to contain PII. A refusal must never trigger a raw remote retry.
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

function requiresStrongTier(task: TaskType): boolean {
  return task === 'brain_ops' || task === 'extraction' || task === 'concierge_complex';
}

function assertStrongModel(model: string): void {
  // Deny known lightweight tiers; an environment variable name is not a quality guarantee.
  if (!model?.trim() || /(?:^|[-/_.])(?:mini|nano|flash|haiku|small|tiny|[1378]b)(?:$|[-/_.])|gpt-3\.5/i.test(model)) {
    throw new AITransportError('ai_policy_refused');
  }
}

function resolveCompletionPlan(task: TaskType, configuredOnly = false): CompletionPlan {
  const dedicated = !configuredOnly && shouldRouteExternally(task, serverEnv);
  const baseUrl = dedicated ? serverEnv.openrouterBaseUrl : serverEnv.aiBaseUrl;
  const apiKey = dedicated ? serverEnv.openrouterApiKey : serverEnv.aiApiKey;
  if (!apiKey) throw new AITransportError('ai_not_configured');
  const openRouter = endpointIsOpenRouter(baseUrl) || dedicated;
  if (openRouter && (task === 'concierge' || task === 'concierge_complex') && !serverEnv.openrouterConciergeEnabled) {
    throw new AITransportError('ai_policy_refused');
  }
  const strong = requiresStrongTier(task);
  const directModel = task === 'extraction' ? serverEnv.aiExtractionModel
    : task === 'brain_ops' ? serverEnv.aiBrainModel
      : task === 'concierge_complex' ? serverEnv.aiConciergeComplexModel : serverEnv.aiChatModel;
  const models = dedicated ? modelChainForTask(task) : strong ? [directModel]
    : openRouter ? modelChainForTask(task) : [directModel];
  if (strong) {
    const variable = dedicated
      ? ({ extraction: 'OPENROUTER_MODEL_EXTRACTION', brain_ops: 'OPENROUTER_MODEL_BRAIN_OPS', concierge_complex: 'OPENROUTER_MODEL_CONCIERGE_COMPLEX' } as const)[task as 'extraction' | 'brain_ops' | 'concierge_complex']
      : ({ extraction: 'AI_EXTRACTION_MODEL', brain_ops: 'AI_BRAIN_MODEL', concierge_complex: 'AI_CONCIERGE_COMPLEX_MODEL' } as const)[task as 'extraction' | 'brain_ops' | 'concierge_complex'];
    // Env defaults historically use ||; do not let an explicitly empty override disappear.
    if (process.env[variable] !== undefined && !process.env[variable]?.trim()) throw new AITransportError('ai_policy_refused');
    models.forEach(assertStrongModel);
  }
  if (models.some((model) => !/^[a-zA-Z0-9][a-zA-Z0-9/_.:-]{0,149}$/.test(model))) {
    throw new AITransportError('ai_not_configured');
  }
  return { baseUrl, apiKey, models, openRouter };
}

/** The same resolved endpoint/model contract used by the actual generation request. */
export function assertResolvedTaskModel(task: TaskType, actual: string): void {
  if (!modelMatchesPlan(actual, resolveCompletionPlan(task).models)) throw new AITransportError('ai_model_mismatch');
}

function safeFailure(error: unknown): Error {
  if (error instanceof AITransportError) return error;
  if (error instanceof ProviderIneligibleError) return new ProviderIneligibleError('provider policy refused');
  return new AITransportError('ai_unavailable');
}

async function complete(
  messages: AIMessage[], opts: GenerateOptions | undefined, task: TaskType, configuredOnly: boolean,
): Promise<GenerateResult> {
  const started = Date.now();
  let plannedModel: string | undefined;
  let plan: CompletionPlan | undefined;
  try {
    plan = resolveCompletionPlan(task, configuredOnly);
    plannedModel = plan.models[0];
    const result = await generatePlannedCompletion(plan, messages, opts);
    log.info('ai_completion', { task, model: result.model, outcome: 'success', latencyMs: Date.now() - started });
    return result;
  } catch (error) {
    let safe = safeFailure(error);
    // Only recognized gateway outages may leave the primary plan. Auth/policy,
    // parser, shape, model and unclassified errors never authorize a provider hop.
    const outage = error instanceof AITransportError
      ? error.outageReason ? new GatewayUnavailableError(error.outageReason)
        : error.status !== undefined ? unavailableFromStatus(error.status) : null
      : null;
    if (plan?.openRouter && outage && process.env.AI_FAILOVER_ENABLED === 'true'
      && (task === 'general' || task === 'classification')) {
      try {
        return await outageFallback(task, messages, opts, outage);
      } catch (secondaryError) {
        // Secondary adapters may throw native parser/network exceptions. Never
        // let their response excerpts escape into caller logs.
        safe = safeFailure(secondaryError);
      }
    }
    log.warn('ai_completion', {
      task, model: plannedModel, outcome: 'failed', latencyMs: Date.now() - started,
      code: safe instanceof ProviderIneligibleError ? safe.code : (safe as AITransportError).code,
    });
    throw safe;
  }
}

/** Direct adapter calls have no data-origin context: conservatively use guest policy. */
export function configuredCompletion(messages: AIMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
  return complete(messages, opts, 'concierge', true);
}

// All production completions use one resolved plan. Approved in-router model failover
// is preserved, but outages/policy refusal NEVER trigger an unguarded second request.
export async function routedCompletion(
  messages: AIMessage[], opts?: GenerateOptions, route?: RouteOptions,
): Promise<GenerateResult> {
  const task = route?.task ?? 'general';
  if (!requiresStrongTier(task) && !isProductionRuntime() && !shouldRouteExternally(task)) {
    const local = getAIProvider();
    if (local.name !== 'openai') return local.generate(messages, opts);
  }
  try {
    return await complete(messages, opts, task, false);
  } catch (error) {
    // Preserve explicitly offline development behavior only; never a remote rescue.
    if (!requiresStrongTier(task) && !isProductionRuntime()) {
      const local = getAIProvider();
      if (local.name === 'dev-fallback') return local.generate(messages, opts);
    }
    throw error;
  }
}
