import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    ollamaBaseUrl: 'http://localhost:11434/v1',
    ollamaChatModel: 'llama3.1',
    ollamaEmbedModel: 'nomic-embed-text',
  },
}));

const fallbackClassifyIntentMock = vi.fn().mockReturnValue('information');
vi.mock('./fallback', () => ({
  fallbackClassifyIntent: fallbackClassifyIntentMock,
}));

const { ollamaProvider } = await import('./ollama');

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('ollama provider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    fallbackClassifyIntentMock.mockClear();
    fallbackClassifyIntentMock.mockReturnValue('information');
  });

  it('embeds texts against the local /v1/embeddings endpoint with no API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { embedding: new Array(1536).fill(0.1), index: 1 },
          { embedding: new Array(1536).fill(0.2), index: 0 },
        ],
        usage: { total_tokens: 7 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await ollamaProvider.embedWithUsage!(['a', 'b']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    // Sorted back into request order despite out-of-order response indices.
    expect(result.vectors[0][0]).toBeCloseTo(0.2);
    expect(result.vectors[1][0]).toBeCloseTo(0.1);
    expect(result.totalTokens).toBe(7);
    expect(result.model).toBe('nomic-embed-text');
  });

  it('returns an empty result without calling fetch for an empty input', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await ollamaProvider.embedWithUsage!([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.vectors).toEqual([]);
  });

  it('throws a clear error when the embed model returns the wrong dimension', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ embedding: new Array(768).fill(0.1), index: 0 }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(ollamaProvider.embed(['a'])).rejects.toThrow(/768-dim/);
  });

  it('throws when the embedding request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ollamaProvider.embed(['a'])).rejects.toThrow(/Ollama embedding request failed: 500/);
  });

  it('generates a chat completion via /v1/chat/completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'hello there' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await ollamaProvider.generate([{ role: 'user', content: 'hi' }]);

    expect(result.text).toBe('hello there');
    expect(result.model).toBe('llama3.1');
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 3 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(JSON.parse(init.body).model).toBe('llama3.1');
  });

  it('throws when the chat request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 503));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ollamaProvider.generate([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /Ollama chat request failed: 503/,
    );
  });

  it('classifies intent from a valid model response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'checkin' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const intent = await ollamaProvider.classifyIntent('what time can I check in');

    expect(intent).toBe('checkin');
    expect(fallbackClassifyIntentMock).not.toHaveBeenCalled();
  });

  it('falls back to heuristic classification when the model response is not a valid intent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: 'not-a-real-intent' } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const intent = await ollamaProvider.classifyIntent('hello');

    expect(intent).toBe('information');
    expect(fallbackClassifyIntentMock).toHaveBeenCalledWith('hello');
  });

  it('falls back to heuristic classification when the request throws', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const intent = await ollamaProvider.classifyIntent('hello');

    expect(intent).toBe('information');
    expect(fallbackClassifyIntentMock).toHaveBeenCalledWith('hello');
  });
});
