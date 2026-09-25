import type { AIMessage, GenerateOptions, GenerateResult } from '@/lib/ai/provider';

const OLLAMA_CLOUD_CHAT_URL = 'https://ollama.com/v1/chat/completions';

/** Independent Ollama Cloud transport, never the local development Ollama provider. */
export async function ollamaCloudGenerate(
  messages: AIMessage[],
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const key = process.env.OLLAMA_API_KEY;
  const model = process.env.OLLAMA_CLOUD_CHAT_MODEL;
  if (!key || !model) throw new Error('Ollama Cloud chat is not configured.');
  if (!messages.length || messages.some((message) => typeof message.content !== 'string')) {
    throw new Error('Ollama Cloud fallback requires nonempty text-only messages.');
  }

  const response = await fetch(OLLAMA_CLOUD_CHAT_URL, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
    }),
  });
  if (!response.ok) {
    // Never include upstream response bodies: they may contain request data or credentials.
    throw new Error(`Ollama Cloud request failed with status ${response.status}.`);
  }

  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null || !('choices' in result)) {
    throw new Error('Ollama Cloud returned an invalid chat response.');
  }
  const parsed = result as { choices?: Array<{ message?: { content?: unknown } }>; model?: unknown };
  const text = parsed.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Ollama Cloud returned no chat text.');
  }
  return { text, model: typeof parsed.model === 'string' ? parsed.model : model };
}
