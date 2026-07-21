import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions, GenerateResult, EmbedResult, IntentType } from './provider';
import { EMBED_DIM } from './provider';
import { serverEnv } from '@/lib/env';
import { Constants } from '@/lib/database.types';
import { fallbackClassifyIntent } from './fallback';

// OpenAI-style adapter. Works with any OpenAI-compatible endpoint via AI_BASE_URL.
// Reads AI_API_KEY, AI_EMBED_MODEL (1536-dim default), AI_CHAT_MODEL.

async function post(path: string, body: unknown): Promise<Response> {
  const url = `${serverEnv.aiBaseUrl.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serverEnv.aiApiKey}`,
    },
    body: JSON.stringify(body),
    // Reasonable timeout guard via AbortController.
    signal: AbortSignal.timeout(30_000),
  });
}

async function embedWithUsageImpl(texts: string[]): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { vectors: [], model: serverEnv.aiEmbedModel, totalTokens: 0 };
  }
  const res = await post('/embeddings', {
    model: serverEnv.aiEmbedModel,
    input: texts,
  });
  if (!res.ok) {
    throw new Error(`Embedding request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { total_tokens?: number };
  };
  const sorted = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of sorted) {
    if (v.length !== EMBED_DIM) {
      throw new Error(`Expected ${EMBED_DIM}-dim embeddings, got ${v.length}`);
    }
  }
  return { vectors: sorted, model: serverEnv.aiEmbedModel, totalTokens: json.usage?.total_tokens ?? 0 };
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
      model: serverEnv.aiChatModel,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 600,
    });
    if (!res.ok) {
      throw new Error(`Chat request failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices[0]?.message?.content ?? '',
      model: serverEnv.aiChatModel,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  },

  async classifyIntent(text: string): Promise<IntentType> {
    const allowed = Constants.public.Enums.intent_type;
    try {
      const res = await post('/chat/completions', {
        model: serverEnv.aiChatModel,
        temperature: 0,
        max_tokens: 12,
        messages: [
          {
            role: 'system',
            content:
              `Classify the guest message into exactly one intent from this list: ${allowed.join(', ')}. ` +
              'Respond with only the intent word.',
          },
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
