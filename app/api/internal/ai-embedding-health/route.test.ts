import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openaiProvider } from '@/lib/ai/openai';
import { POST } from './route';

vi.mock('@/lib/ai/openai', () => ({
  openaiProvider: { embedWithUsage: vi.fn() },
}));

const embed = vi.mocked(openaiProvider.embedWithUsage!);
const request = (token?: string) => new Request('https://example.test/api/internal/ai-embedding-health', {
  method: 'POST',
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe('synthetic embedding readiness', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CRON_SECRET', 'synthetic-test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects absent and incorrect bearer tokens without calling the provider', async () => {
    expect((await POST(request())).status).toBe(404);
    expect((await POST(request('wrong'))).status).toBe(404);
    expect(embed).not.toHaveBeenCalled();
  });

  it('fails closed when the server secret is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await POST(request('synthetic-test-secret'))).status).toBe(404);
    expect(embed).not.toHaveBeenCalled();
  });

  it('returns only model and dimension for a valid synthetic vector', async () => {
    embed.mockResolvedValue({ vectors: [Array(1536).fill(0.01)], model: 'text-embedding-3-small', totalTokens: 6 });
    const response = await POST(request('synthetic-test-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, model: 'text-embedding-3-small', dimension: 1536 });
    expect(embed).toHaveBeenCalledWith(['moche-ai-synthetic-embedding-health-v1']);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects fallback-like zero vectors and wrong dimensions', async () => {
    for (const vector of [Array(1536).fill(0), Array(768).fill(0.01)]) {
      embed.mockResolvedValueOnce({ vectors: [vector], model: 'test', totalTokens: 0 });
      const response = await POST(request('synthetic-test-secret'));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, reason: 'invalid_embedding_dimension_or_values' });
    }
  });

  it('hides provider error details', async () => {
    embed.mockRejectedValue(new Error('sensitive upstream response'));
    const response = await POST(request('synthetic-test-secret'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: 'embedding_provider_unavailable' });
  });
});
