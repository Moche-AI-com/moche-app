import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ollamaCloudGenerate } from './ollama-cloud';

const messages = [{ role: 'user' as const, content: 'Synthetic routing test.' }];

describe('independent Ollama Cloud transport', () => {
  beforeEach(() => {
    vi.stubEnv('OLLAMA_API_KEY', 'synthetic-test-key');
    vi.stubEnv('OLLAMA_CLOUD_CHAT_MODEL', 'test-cloud-model');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('fails closed when key or model is absent', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.stubEnv('OLLAMA_API_KEY', '');
    await expect(ollamaCloudGenerate(messages)).rejects.toThrow('not configured');
    vi.stubEnv('OLLAMA_API_KEY', 'synthetic-test-key');
    vi.stubEnv('OLLAMA_CLOUD_CHAT_MODEL', '');
    await expect(ollamaCloudGenerate(messages)).rejects.toThrow('not configured');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sends text to the fixed cloud host and returns the actual model', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      model: 'test-cloud-model', choices: [{ message: { content: 'Synthetic answer.' } }],
    }));
    vi.stubGlobal('fetch', fetcher);
    await expect(ollamaCloudGenerate(messages, { temperature: 0.2, maxTokens: 64 }))
      .resolves.toEqual({ text: 'Synthetic answer.', model: 'test-cloud-model' });
    expect(fetcher.mock.calls[0][0]).toBe('https://ollama.com/v1/chat/completions');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      model: 'test-cloud-model', messages, stream: false, max_tokens: 64,
    });
  });

  it('does not drop image-bearing messages into a text-only fallback', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(ollamaCloudGenerate([{ role: 'user', content: [] }]))
      .rejects.toThrow('text-only');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects upstream failures without returning the upstream body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive upstream text', { status: 503 })));
    await expect(ollamaCloudGenerate(messages)).rejects.toThrow('status 503');
  });

  it('rejects empty completions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '' } }] })));
    await expect(ollamaCloudGenerate(messages)).rejects.toThrow('no chat text');
  });
});
