import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions, GenerateResult, EmbedResult, IntentType } from './provider';
import { EMBED_DIM } from './provider';
import { serverEnv } from '@/lib/env';
import { Constants } from '@/lib/database.types';
import { fallbackClassifyIntent } from './fallback';
import { redactPII, containsLikelyPII } from './redaction';

// Chat and embeddings are independent. Never change chat routing when fixing embeddings.
async function post(path: string, body: unknown): Promise<Response> {
  return postTo(serverEnv.aiBaseUrl, serverEnv.aiApiKey, path, body);
}

async function postTo(baseUrl: string, apiKey: string, path: string, body: unknown): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
}

// Default remains the existing direct embedding provider. An explicit opt-in can
// use the already-configured OpenRouter key when the direct embedding key is broken.
// Never silently substitute a different embedding family or vector dimension.
function embeddingConfig(): { baseUrl: string; apiKey: string; model: string; viaRouter: boolean } {
  if (process.env.AI_EMBED_USE_OPENROUTER === 'true') {
    if (!serverEnv.openrouterApiKey) throw new Error('OpenRouter embedding route is not configured.');
    return { baseUrl: 'https://openrouter.ai/api/v1', apiKey: serverEnv.openrouterApiKey,
      model: 'openai/text-embedding-3-small', viaRouter: true };
  }
  return { baseUrl: serverEnv.aiEmbedBaseUrl, apiKey: serverEnv.aiEmbedApiKey,
    model: serverEnv.aiEmbedModel, viaRouter: false };
}

async function embedWithUsageImpl(texts: string[]): Promise<EmbedResult> {
  const route = embeddingConfig();
  if (texts.length === 0) return { vectors: [], model: route.model, totalTokens: 0 };
  const input = route.viaRouter ? texts.map(redactPII) : texts;
  if (route.viaRouter && input.some(containsLikelyPII)) {
    throw new Error('Embedding input contains residual PII.');
  }
  const res = await postTo(route.baseUrl, route.apiKey, '/embeddings', {
    model: route.model, input,
    ...(route.viaRouter ? { provider: { zdr: true, data_collection: 'deny' } } : {}),
  });
  if (!res.ok) throw new Error(`Embedding request failed: ${res.status}`);
  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { total_tokens?: number };
  };
  if (!Array.isArray(json.data) || json.data.length !== texts.length) {
    throw new Error('Embedding response has an unexpected vector count.');
  }
  const sorted = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of sorted) {
    if (!Array.isArray(v) || v.length !== EMBED_DIM || v.some((n) => !Number.isFinite(n))) {
      throw new Error(`Expected ${EMBED_DIM}-dim finite embeddings.`);
    }
  }
  return { vectors: sorted, model: route.model, totalTokens: json.usage?.total_tokens ?? 0 };
}

export const openaiProvider: AIProvider = {
  name: 'openai',
  chatModel: serverEnv.aiChatModel,
  embedModel: serverEnv.aiEmbedModel,

  async embed(texts: string[]): Promise<number[][]> {
    return (await embedWithUsageImpl(texts)).vectors;
  },

  embedWithUsage(texts: string[]): Promise<EmbedResult> {
    return embedWithUsageImpl(texts);
  },

  async generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    const res = await post('/chat/completions', {
      model: serverEnv.aiChatModel, messages,
      temperature: opts?.temperature ?? 0.3, max_tokens: opts?.maxTokens ?? 600,
    });
    if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices[0]?.message?.content ?? '', model: serverEnv.aiChatModel,
      usage: { promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0 },
    };
  },

  async classifyIntent(text: string): Promise<IntentType> {
    const allowed = Constants.public.Enums.intent_type;
    try {
      const res = await post('/chat/completions', {
        model: serverEnv.aiChatModel, temperature: 0, max_tokens: 12,
        messages: [
          { role: 'system', content: `Classify the guest message into exactly one intent from this list: ${allowed.join(', ')}. Respond with only the intent word.` },
          { role: 'user', content: text },
        ],
      });
      if (res.ok) {
        const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        const raw = (json.choices[0]?.message?.content ?? '').trim().toLowerCase();
        if ((allowed as readonly string[]).includes(raw)) return raw as IntentType;
      }
    } catch {
      // fall through to heuristic
    }
    return fallbackClassifyIntent(text);
  },
};
