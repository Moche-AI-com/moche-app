import 'server-only';
import type { AIProvider, ChatMessage, GenerateOptions, GenerateResult, IntentType } from './provider';
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

export const openaiProvider: AIProvider = {
  name: 'openai',
  chatModel: serverEnv.aiChatModel,
  embedModel: serverEnv.aiEmbedModel,

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await post('/embeddings', {
      model: serverEnv.aiEmbedModel,
      input: texts,
    });
    if (!res.ok) {
      throw new Error(`Embedding request failed: ${res.status}`);
    }
    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const sorted = json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    for (const v of sorted) {
      if (v.length !== EMBED_DIM) {
        throw new Error(`Expected ${EMBED_DIM}-dim embeddings, got ${v.length}`);
      }
    }
    return sorted;
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
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return { text: json.choices[0]?.message?.content ?? '', model: serverEnv.aiChatModel };
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
