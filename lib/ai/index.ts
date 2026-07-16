import 'server-only';
import type { AIProvider } from './provider';
import { fallbackProvider } from './fallback';
import { openaiProvider } from './openai';
import { serverEnv } from '@/lib/env';

// Selects the active provider. Dev-fallback wins whenever the flag is on or no key exists,
// so the app runs fully offline. Swapping in a real key + flag=false is a trivial env change.
export function getAIProvider(): AIProvider {
  if (serverEnv.aiDevFallback || !serverEnv.aiApiKey) {
    return fallbackProvider;
  }
  return openaiProvider;
}

export type { AIProvider, ChatMessage, GenerateResult } from './provider';
export { EMBED_DIM } from './provider';
