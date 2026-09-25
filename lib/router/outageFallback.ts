import 'server-only';
import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';
import { redactMessages, contentContainsLikelyPII } from '@/lib/ai/redaction';
import { ollamaCloudGenerate } from '@/lib/ai/ollama-cloud';
import { openaiDirectGenerate } from '@/lib/ai/openai-direct';
import { log } from '@/lib/log';

export type OutageReason = 'rate_limited' | 'upstream' | 'network' | 'timeout';

export class GatewayUnavailableError extends Error {
  constructor(readonly reason: OutageReason) {
    super('Primary AI gateway is temporarily unavailable.');
    this.name = 'GatewayUnavailableError';
  }
}

// 4xx policy/auth errors, including 401 and 403, must never trigger a provider hop.
export function unavailableFromStatus(status: number): GatewayUnavailableError | null {
  if (status === 429) return new GatewayUnavailableError('rate_limited');
  if (status >= 500 && status <= 599) return new GatewayUnavailableError('upstream');
  return null;
}

function retryableSecondaryFailure(error: unknown): boolean {
  if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')) return true;
  return error instanceof Error && /^Ollama Cloud request failed with status (429|5\d\d)\.$/.test(error.message);
}

/** Deliberately excludes guest answers and strong Brain/extraction tasks. */
export async function outageFallback(
  task: 'general' | 'classification' | 'concierge' | 'concierge_complex' | 'brain_ops' | 'extraction',
  messages: AIMessage[],
  opts: GenerateOptions | undefined,
  failure: GatewayUnavailableError,
): Promise<GenerateResult> {
  if (process.env.AI_FAILOVER_ENABLED !== 'true' ||
      (task !== 'general' && task !== 'classification')) throw failure;
  if (!messages.length || messages.some((message) => typeof message.content !== 'string')) throw failure;

  const safeMessages = redactMessages(messages);
  if (safeMessages.some((message) => contentContainsLikelyPII(message.content))) {
    throw new Error('AI failover refused residual PII.');
  }

  if (process.env.OLLAMA_API_KEY && process.env.OLLAMA_CLOUD_CHAT_MODEL) {
    try {
      log.warn('ai_failover_attempt', { task, provider: 'ollama-cloud', reason: failure.reason });
      return await ollamaCloudGenerate(safeMessages, opts);
    } catch (error) {
      if (!retryableSecondaryFailure(error)) throw error;
      log.warn('ai_failover_unavailable', { task, provider: 'ollama-cloud', reason: 'upstream' });
    }
  }
  if (process.env.OPENAI_DIRECT_API_KEY) {
    log.warn('ai_failover_attempt', { task, provider: 'openai-direct', reason: failure.reason });
    return openaiDirectGenerate(safeMessages, opts);
  }
  throw failure;
}
