import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

// The kind of AI work a usage row represents.
export type AiUsageKind = 'chat' | 'embed' | 'classify' | 'ingest' | 'other';

// Static price table (USD per 1,000,000 tokens). Keyed by model name.
//
// IMPORTANT: an unpriced model costs 0, which silently understates spend. Every model
// we can actually reach at runtime MUST have an entry here. When an unknown model is
// seen we emit a loud `ai_usage_unpriced_model` warning so the gap surfaces in logs
// instead of quietly reporting $0 margin-safe numbers that are wrong.
//
// OpenRouter model ids are namespaced (`google/gemini-2.5-flash`); direct OpenAI ids
// are bare (`gpt-4o-mini`). Both forms are listed because AI_BASE_URL decides which
// we hit. Prices verified against https://openrouter.ai/api/v1/models on 2026-08-04.
interface ModelPrice {
  inputPer1M: number; // prompt / embed input
  outputPer1M: number; // completion output (0 for embeddings)
}

const PRICES: Record<string, ModelPrice> = {
  // --- OpenRouter (primary path) ---
  'google/gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5 },
  'google/gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'anthropic/claude-haiku-4.5': { inputPer1M: 1.0, outputPer1M: 5.0 },
  'anthropic/claude-3.5-haiku': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'openai/text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
  // Classification tier (OPENROUTER_MODEL_CLASSIFICATION default).
  'meta-llama/llama-3.1-8b-instruct': { inputPer1M: 0.05, outputPer1M: 0.08 },

  // --- Direct OpenAI (legacy / fallback path) ---
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
  'text-embedding-3-large': { inputPer1M: 0.13, outputPer1M: 0 },

  // --- Non-billable pseudo-models ---
  // Served from the brain cache: no external call, genuinely free.
  cache: { inputPer1M: 0, outputPer1M: 0 },
  // Dev fallback runs offline — free.
  'dev-fallback-chat': { inputPer1M: 0, outputPer1M: 0 },
  'dev-fallback-embed': { inputPer1M: 0, outputPer1M: 0 },
  // Local Ollama models are dev-only and never billed.
  'llama3.1': { inputPer1M: 0, outputPer1M: 0 },
  'nomic-embed-text': { inputPer1M: 0, outputPer1M: 0 },
};

// Models we intentionally price at zero. Used to distinguish "free by design" from
// "we forgot to price this", so the warning below stays signal and not noise.
const FREE_BY_DESIGN = new Set([
  'cache',
  'dev-fallback-chat',
  'dev-fallback-embed',
  'llama3.1',
  'nomic-embed-text',
]);

// OpenRouter appends variant suffixes to some ids (e.g. `:free`, `:nitro`, `:floor`).
// Strip them so `google/gemini-2.5-flash:nitro` still prices correctly.
function normalizeModelId(model: string): string {
  return model.trim().split(':')[0];
}

// Look up a price, tolerating OpenRouter variant suffixes and namespace differences.
function resolvePrice(model: string): ModelPrice | undefined {
  const direct = PRICES[model];
  if (direct) return direct;
  const normalized = normalizeModelId(model);
  const byNormalized = PRICES[normalized];
  if (byNormalized) return byNormalized;
  // Last resort: match on the bare model name after the provider namespace, so a new
  // namespace (e.g. `google-vertex/gemini-2.5-flash`) still costs rather than zeroing.
  const bare = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : undefined;
  return bare ? PRICES[bare] : undefined;
}

// Estimate cost in USD from a model + token counts.
//
// Returns 0 for unpriced models (so telemetry never throws) but logs a warning first.
// Treat a rising `ai_usage_unpriced_model` count as a billing-accuracy incident: it
// means real spend is being recorded as free.
export function estimateCostUsd(
  model: string,
  tokens: { promptTokens?: number; completionTokens?: number; embedTokens?: number },
): number {
  const inputTok = (tokens.promptTokens ?? 0) + (tokens.embedTokens ?? 0);
  const outputTok = tokens.completionTokens ?? 0;
  const price = resolvePrice(model);
  if (!price) {
    // Only warn when tokens were actually consumed — a zero-token row costs nothing
    // either way and would otherwise spam the logs.
    if (inputTok > 0 || outputTok > 0) {
      log.warn('ai_usage_unpriced_model', { model, inputTok, outputTok });
    }
    return 0;
  }
  if (FREE_BY_DESIGN.has(normalizeModelId(model))) return 0;
  const cost = (inputTok / 1_000_000) * price.inputPer1M + (outputTok / 1_000_000) * price.outputPer1M;
  // Round to 6 decimals to match the numeric(12,6) column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// Exposed for tests and for an ops check that asserts the configured runtime models
// are priced before a deploy is considered healthy.
export function isModelPriced(model: string): boolean {
  return resolvePrice(model) !== undefined;
}

export interface LogAiUsageInput {
  propertyId?: string | null;
  kind: AiUsageKind;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  embedTokens?: number;
  cacheHit?: boolean;
  latencyMs?: number;
  source?: string; // e.g. 'guest_chat', 'preview', 'ingest'
}

// Fire-and-forget usage logger. NEVER throws and NEVER blocks the caller's response —
// telemetry failures must not degrade the guest experience. Call without awaiting, or
// await Promise.allSettled if you want to fan out several at once.
export async function logAiUsage(admin: Admin, input: LogAiUsageInput): Promise<void> {
  try {
    const est_cost_usd = estimateCostUsd(input.model, {
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      embedTokens: input.embedTokens,
    });
    const { error } = await admin.from('ai_usage').insert({
      property_id: input.propertyId ?? null,
      kind: input.kind,
      model: input.model,
      prompt_tokens: input.promptTokens ?? 0,
      completion_tokens: input.completionTokens ?? 0,
      embed_tokens: input.embedTokens ?? 0,
      est_cost_usd,
      cache_hit: input.cacheHit ?? false,
      latency_ms: input.latencyMs ?? null,
      source: input.source ?? null,
    });
    if (error) log.warn('ai_usage_log_failed', { error: error.message, kind: input.kind });
  } catch (e) {
    log.warn('ai_usage_log_threw', { error: String(e), kind: input.kind });
  }
}
