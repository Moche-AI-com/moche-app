import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions, GenerateResult, EmbedResult, IntentType } from './provider';
import { EMBED_DIM } from './provider';
import { serverEnv } from '@/lib/env';
import { Constants } from '@/lib/database.types';
import { fallbackClassifyIntent } from './fallback';

// Dev-only local provider (PR #5). Talks to a local Ollama instance via its
// OpenAI-compatible /v1 surface (Ollama maps /v1/chat/completions -> /api/chat and
// /v1/embeddings -> /api/embed under the hood), so this mirrors openai.ts's shape
// exactly. No API key is required or sent. NEVER selected in production --
// lib/ai/index.ts's isProductionRuntime() gate wins before this provider is
// reachable, regardless of AI_DEV_PROVIDER.
// Reads OLLAMA_BASE_URL, OLLAMA_CHAT_MODEL, OLLAMA_EMBED_MODEL.

async function post(path: string, body: unknown): Promise<Response> {
  const url = `${serverEnv.ollamaBaseUrl.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    // Local inference can be slower than a hosted API; generous but bounded timeout.
    signal: AbortSignal.timeout(60_000),
  });
}

async function embedWithUsageImpl(texts: string[]): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { vectors: [], model: serverEnv.ollamaEmbedModel, totalTokens: 0 };
  }
  const res = await post('/embeddings', {
    model: serverEnv.ollamaEmbedModel,
    input: texts,
  });
  if (!res.ok) {
    throw new Error(`Ollama embedding request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { total_tokens?: number };
  };
  const sorted = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of sorted) {
    if (v.length !== EMBED_DIM) {
      throw new Error(
        `Ollama embed model '${serverEnv.ollamaEmbedModel}' returned ${v.length}-dim vectors, expected ${EMBED_DIM}. ` +
          'Point OLLAMA_EMBED_MODEL at a model that emits the locked dimension.',
      );
    }
  }
  return { vectors: sorted, model: serverEnv.ollamaEmbedModel, totalTokens: json.usage?.total_tokens ?? 0 };
}

export const ollamaProvider: AIProvider = {
  name: 'ollama',
  chatModel: serverEnv.ollamaChatModel,
  embedModel: serverEnv.ollamaEmbedModel,

  async embed(texts: string[]): Promise<number[][]> {
    return (await embedWithUsageImpl(texts)).vectors;
  },

  embedWithUsage(texts: string[]): Promise<EmbedResult> {
    return embedWithUsageImpl(texts);
  },

  async generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<GenerateResult> {
    const res = await post('/chat/completions', {
      model: serverEnv.ollamaChatModel,
      messages,
      temperature: opts?.temperature ?? 0.3,
      max_tokens: opts?.maxTokens ?? 600,
    });
    if (!res.ok) {
      throw new Error(`Ollama chat request failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: json.choices[0]?.message?.content ?? '',
      model: serverEnv.ollamaChatModel,
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
        model: serverEnv.ollamaChatModel,
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
