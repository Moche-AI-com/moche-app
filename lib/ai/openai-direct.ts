import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';

const DIRECT_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

/** Chat fallback independent of AI_BASE_URL, which may itself be OpenRouter. */
export async function openaiDirectGenerate(
  messages: AIMessage[],
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const key = process.env.OPENAI_DIRECT_API_KEY;
  const model = process.env.OPENAI_DIRECT_CHAT_MODEL || 'gpt-4o';
  if (!key) throw new Error('Direct OpenAI chat is not configured.');
  if (!messages.length || messages.some((message) => typeof message.content !== 'string')) {
    throw new Error('Direct OpenAI text fallback requires nonempty text-only messages.');
  }

  const response = await fetch(DIRECT_CHAT_URL, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model, messages, stream: false,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }),
  });
  if (!response.ok) {
    // Do not include upstream response bodies or submitted messages in errors.
    throw new Error(`Direct OpenAI request failed with status ${response.status}.`);
  }

  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null || !('choices' in result)) {
    throw new Error('Direct OpenAI returned an invalid chat response.');
  }
  const parsed = result as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown };
  const text = parsed.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Direct OpenAI returned no chat text.');
  }
  return { text, model: typeof parsed.model === 'string' ? parsed.model : model };
}
