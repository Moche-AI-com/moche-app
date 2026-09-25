import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openaiDirectGenerate } from './openai-direct';

const messages = [{ role: 'user' as const, content: 'Synthetic routing test.' }];

describe('independent direct OpenAI transport', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_DIRECT_API_KEY', 'synthetic-direct-key');
    vi.stubEnv('OPENAI_DIRECT_CHAT_MODEL', 'gpt-4o');
    vi.stubEnv('AI_BASE_URL', 'https://openrouter.ai/api/v1');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('does not call a provider without a dedicated direct key', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('OPENAI_DIRECT_API_KEY', '');
    await expect(openaiDirectGenerate(messages)).rejects.toThrow('not configured');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('never follows AI_BASE_URL back to OpenRouter', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      model: 'gpt-4o', choices: [{ message: { content: 'Synthetic answer.' } }],
    }));
    vi.stubGlobal('fetch', fetcher);
    await expect(openaiDirectGenerate(messages, { temperature: 0.2, maxTokens: 64 }))
      .resolves.toEqual({ text: 'Synthetic answer.', model: 'gpt-4o' });
    expect(fetcher.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      model: 'gpt-4o', messages, stream: false, max_tokens: 64,
    });
  });

  it('refuses to silently discard image content', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(openaiDirectGenerate([{ role: 'user', content: [] }]))
      .rejects.toThrow('text-only');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not echo upstream errors or return empty output', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('sensitive upstream text', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '' } }] }));
    vi.stubGlobal('fetch', fetcher);
    await expect(openaiDirectGenerate(messages)).rejects.toThrow('status 503');
    await expect(openaiDirectGenerate(messages)).rejects.toThrow('no chat text');
  });
});
