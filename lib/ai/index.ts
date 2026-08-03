import 'server-only';
import type { AIProvider } from './provider';
import { fallbackProvider } from './fallback';
import { openaiProvider } from './openai';
import { ollamaProvider } from './ollama';
import { serverEnv, isProductionRuntime } from '@/lib/env';
import { EMBED_DIM } from './provider';

// Selects the active provider.
//   production → NEVER the dev fallback, NEVER Ollama (M3/M5). If no AI key is
//                configured, throw so routes fail loudly instead of serving stubbed
//                answers. AI_DEV_FALLBACK and AI_DEV_PROVIDER are both ignored in
//                production — this check runs first and returns unconditionally, so
//                no later branch can ever select a dev-only provider on a real deploy.
//   dev/preview → Ollama when AI_DEV_PROVIDER='ollama' (PR #5, production-inert);
//                else dev fallback when the flag is on or no key exists (runs fully
//                offline); else OpenAI.
export function getAIProvider(): AIProvider {
  if (isProductionRuntime()) {
    if (!serverEnv.aiApiKey) {
      throw new Error(
        'AI provider is not configured: AI_API_KEY is missing and the dev fallback is disabled in production.',
      );
    }
    return openaiProvider;
  }
  if (serverEnv.aiDevProvider === 'ollama') {
    return ollamaProvider;
  }
  if (serverEnv.aiDevFallback || !serverEnv.aiApiKey) {
    return fallbackProvider;
  }
  return openaiProvider;
}

// M2 guard helper: ingestion / embedding paths can assert the configured embedding
// dimension matches the locked EMBED_DIM (text-embedding-3-small / 1536) and fail clearly.
export function assertEmbedDim(dim: number): void {
  if (dim !== EMBED_DIM) {
    throw new Error(`Embedding dimension mismatch: expected ${EMBED_DIM}, got ${dim}.`);
  }
}

export type { AIProvider, ChatMessage, GenerateResult } from './provider';
export { EMBED_DIM } from './provider';
