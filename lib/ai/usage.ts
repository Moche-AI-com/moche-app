import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

// The kind of AI work a usage row represents.
export type AiUsageKind = 'chat' | 'embed' | 'classify' | 'ingest' | 'other';

// Static price table (USD per 1,000,000 tokens). Keyed by model name.
// Only the models we actually run are listed; unknown models cost 0 (still logged,
// so we notice untracked spend rather than silently mis-costing it).
// Update these if OpenAI list prices change.
interface ModelPrice {
  inputPer1M: number; // prompt / embed input
  outputPer1M: number; // completion output (0 for embeddings)
}

const PRICES: Record<string, ModelPrice> = {
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'text-embedding-3-small': { inputPer1M: 0.02, outputPer1M: 0 },
  'text-embedding-3-large': { inputPer1M: 0.13, outputPer1M: 0 },
  // Dev fallback runs offline — free.
  'dev-fallback-chat': { inputPer1M: 0, outputPer1M: 0 },
  'dev-fallback-embed': { inputPer1M: 0, outputPer1M: 0 },
};

// Estimate cost in USD from a model + token counts.
export function estimateCostUsd(
  model: string,
  tokens: { promptTokens?: number; completionTokens?: number; embedTokens?: number },
): number {
  const price = PRICES[model];
  if (!price) return 0;
  const inputTok = (tokens.promptTokens ?? 0) + (tokens.embedTokens ?? 0);
  const outputTok = tokens.completionTokens ?? 0;
  const cost = (inputTok / 1_000_000) * price.inputPer1M + (outputTok / 1_000_000) * price.outputPer1M;
  // Round to 6 decimals to match the numeric(12,6) column.
  return Math.round(cost * 1_000_000) / 1_000_000;
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
