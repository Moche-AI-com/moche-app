import { afterEach, describe, expect, it, vi } from 'vitest';
const env = vi.hoisted(() => ({
  aiApiKey: 'chat-key', aiBaseUrl: 'https://openrouter.ai/api/v1',
  aiChatModel: 'google/gemini-2.5-flash',
  aiEmbedBaseUrl: 'https://api.openai.com/v1', aiEmbedApiKey: 'direct-key',
  aiEmbedModel: 'text-embedding-3-small', openrouterApiKey: 'router-key',
}));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
import { openaiProvider } from './openai';

const response = { data: [{ index: 0, embedding: Array(1536).fill(0) }], usage: { total_tokens: 5 } };
const request = vi.fn().mockResolvedValue({ ok: true, json: async () => response });

describe('embedding provider routing', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); env.openrouterApiKey = 'router-key'; request.mockClear(); });

  it('keeps the direct embedding route by default', async () => {
    vi.stubGlobal('fetch', request);
    const r = await openaiProvider.embedWithUsage!(['where is parking?']);
    expect(r.model).toBe('text-embedding-3-small');
    expect(request.mock.calls[0][0]).toBe('https://api.openai.com/v1/embeddings');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer direct-key');
  });

  it('uses OpenRouter only when explicitly opted in, without changing chat', async () => {
    vi.stubEnv('AI_EMBED_USE_OPENROUTER', 'true');
    vi.stubGlobal('fetch', request);
    const r = await openaiProvider.embedWithUsage!(['where is parking?']);
    expect(r.model).toBe('openai/text-embedding-3-small');
    expect(r.vectors[0]).toHaveLength(1536);
    expect(request.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/embeddings');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer router-key');
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.provider).toMatchObject({ zdr: true, data_collection: 'deny' });
    expect(openaiProvider.chatModel).toBe('google/gemini-2.5-flash');
  });

  it('refuses to send a request when the router key is absent', async () => {
    vi.stubEnv('AI_EMBED_USE_OPENROUTER', 'true');
    env.openrouterApiKey = '';
    vi.stubGlobal('fetch', request);
    await expect(openaiProvider.embedWithUsage!(['test'])).rejects.toThrow('not configured');
    expect(request).not.toHaveBeenCalled();
  });
});
