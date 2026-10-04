import 'server-only';
import type { AIProvider, AIMessage, GenerateOptions, GenerateResult, EmbedResult, IntentType } from './provider';
import { EMBED_DIM } from './provider';
import { serverEnv } from '@/lib/env';
import { fallbackClassifyIntent } from './fallback';
import { redactPII, containsLikelyPII } from './redaction';
import { AITransportError, asRecord, endpointIsOpenRouter, fetchAIJson, tokenCount } from '@/lib/router/transport';
import { log } from '@/lib/log';

// Explicit embedding-only override; never change chat routing or embedding family.
function embeddingConfig() {
  if (process.env.AI_EMBED_USE_OPENROUTER === 'true') {
    return {
      baseUrl: 'https://openrouter.ai/api/v1', apiKey: serverEnv.openrouterApiKey,
      model: 'openai/text-embedding-3-small', viaRouter: true,
    };
  }
  return {
    baseUrl: serverEnv.aiEmbedBaseUrl, apiKey: serverEnv.aiEmbedApiKey,
    model: serverEnv.aiEmbedModel, viaRouter: false,
  };
}

async function embedWithUsageImpl(texts: string[]): Promise<EmbedResult> {
  const route = embeddingConfig();
  if (texts.length === 0) return { vectors: [], model: route.model, totalTokens: 0 };
  const started = Date.now();
  try {
    if (!route.apiKey || !/^[a-zA-Z0-9][a-zA-Z0-9/_.:-]{0,149}$/.test(route.model)) {
      throw new AITransportError('ai_not_configured');
    }
    const viaRouter = endpointIsOpenRouter(route.baseUrl) || route.viaRouter;
    // Query and indexed-document embeddings use the same outbound privacy boundary.
    // Stored/approved source text is not mutated by this projection.
    const input = texts.map(redactPII);
    if (input.some(containsLikelyPII)) throw new AITransportError('ai_policy_refused');
    const json = asRecord(await fetchAIJson(`${route.baseUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}`,
        ...(viaRouter ? { 'X-OpenRouter-ZDR': 'true' } : {}),
      },
      body: JSON.stringify({
        model: route.model, input,
        ...(viaRouter ? { provider: { zdr: true, data_collection: 'deny' } } : {}),
      }),
    }));
    if (!Array.isArray(json.data) || json.data.length !== texts.length) throw new AITransportError('ai_invalid_response');
    const vectors: number[][] = Array(texts.length);
    const seen = new Set<number>();
    for (const raw of json.data) {
      const row = asRecord(raw);
      const index = row.index;
      const values = row.embedding;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= texts.length || seen.has(index)
        || !Array.isArray(values) || values.length !== EMBED_DIM
        || !values.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))) {
        throw new AITransportError('ai_invalid_response');
      }
      seen.add(index);
      vectors[index] = values;
    }
    log.info('ai_embedding', { task: 'embedding', model: route.model, outcome: 'success', latencyMs: Date.now() - started });
    return { vectors, model: route.model, totalTokens: tokenCount(asRecord(json.usage).total_tokens) };
  } catch (error) {
    const safe = error instanceof AITransportError ? error : new AITransportError('ai_unavailable');
    // No input, raw response, URL, or exception text is propagated to logs/callers.
    log.warn('ai_embedding', { task: 'embedding', outcome: 'failed', code: safe.code, latencyMs: Date.now() - started });
    throw safe;
  }
}

export const openaiProvider: AIProvider = {
  name: 'openai',
  chatModel: serverEnv.aiChatModel,
  embedModel: serverEnv.aiEmbedModel,
  async embed(texts: string[]): Promise<number[][]> {
    return (await embedWithUsageImpl(texts)).vectors;
  },
  embedWithUsage: embedWithUsageImpl,
  async generate(messages: AIMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    // Dynamic import avoids the provider-selector/router import cycle. There is no raw
    // chat HTTP path here: unclassified calls receive the conservative guest policy.
    const { configuredCompletion } = await import('@/lib/router/modelRouter');
    return configuredCompletion(messages, opts);
  },
  async classifyIntent(text: string): Promise<IntentType> {
    // The production concierge already uses this deterministic classifier. Keep this
    // context-free compatibility method local rather than creating a policy bypass.
    return fallbackClassifyIntent(text);
  },
};
