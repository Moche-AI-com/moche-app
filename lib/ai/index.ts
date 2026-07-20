import 'server-only';
import type { AIProvider } from './provider';
import { fallbackProvider } from './fallback';
import { openaiProvider } from './openai';
import { serverEnv, isProductionRuntime } from '@/lib/env';
import { EMBED_DIM } from './provider';

// Selects the active provider.
//   production → NEVER the dev fallback (M3). If no AI key is configured, throw so routes
//                fail loudly instead of serving stubbed answers. The dev-fallback flag is
//                ignored in production.
//   dev/preview → dev fallback when the flag is on or no key exists (runs fully offline).
export function getAIProvider(): AIProvider {
  if (isProductionRuntime()) {
    if (!serverEnv.aiApiKey) {
      throw new Error(
        'AI provider is not configured: AI_API_KEY is missing and the dev fallback is disabled in production.',
      );
    }
    return openaiProvider;
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
