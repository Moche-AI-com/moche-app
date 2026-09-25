import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapters = vi.hoisted(() => ({ ollama: vi.fn(), direct: vi.fn() }));
vi.mock('@/lib/ai/ollama-cloud', () => ({ ollamaCloudGenerate: adapters.ollama }));
vi.mock('@/lib/ai/openai-direct', () => ({ openaiDirectGenerate: adapters.direct }));
import { GatewayUnavailableError, unavailableFromStatus, outageFallback } from './outageFallback';

const messages = [{ role: 'user' as const, content: 'Synthetic house-rule question.' }];
const outage = new GatewayUnavailableError('upstream');

describe('task-scoped independent outage fallback', () => {
  beforeEach(() => {
    vi.stubEnv('AI_FAILOVER_ENABLED', 'true');
    vi.stubEnv('OLLAMA_API_KEY', 'synthetic-ollama-key');
    vi.stubEnv('OLLAMA_CLOUD_CHAT_MODEL', 'gpt-oss:20b');
    vi.stubEnv('OPENAI_DIRECT_API_KEY', 'synthetic-direct-key');
    adapters.ollama.mockReset().mockResolvedValue({ text: 'Ollama answer.', model: 'gpt-oss:20b' });
    adapters.direct.mockReset().mockResolvedValue({ text: 'Direct answer.', model: 'gpt-4o' });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('treats only 429 and 5xx as retryable gateway statuses', () => {
    expect(unavailableFromStatus(429)?.reason).toBe('rate_limited');
    expect(unavailableFromStatus(503)?.reason).toBe('upstream');
    for (const status of [400, 401, 403, 422]) expect(unavailableFromStatus(status)).toBeNull();
  });

  it('is default-off without an explicit canary flag', async () => {
    vi.stubEnv('AI_FAILOVER_ENABLED', '');
    await expect(outageFallback('general', messages, undefined, outage)).rejects.toBe(outage);
    expect(adapters.ollama).not.toHaveBeenCalled();
    expect(adapters.direct).not.toHaveBeenCalled();
  });

  it.each(['brain_ops', 'extraction', 'concierge', 'concierge_complex'] as const)
  ('does not downgrade %s', async (task) => {
    await expect(outageFallback(task, messages, undefined, outage)).rejects.toBe(outage);
    expect(adapters.ollama).not.toHaveBeenCalled();
    expect(adapters.direct).not.toHaveBeenCalled();
  });

  it('uses Ollama for routine text after an eligible outage and redacts PII', async () => {
    await outageFallback('classification', [{ role: 'user', content: 'guest@example.com' }], undefined, outage);
    expect(adapters.ollama).toHaveBeenCalledTimes(1);
    const submitted = adapters.ollama.mock.calls[0][0];
    expect(JSON.stringify(submitted)).not.toContain('guest@example.com');
    expect(adapters.direct).not.toHaveBeenCalled();
  });

  it('uses direct OpenAI only when Ollama is absent or retryably unavailable', async () => {
    adapters.ollama.mockRejectedValueOnce(new Error('Ollama Cloud request failed with status 503.'));
    await expect(outageFallback('general', messages, undefined, outage))
      .resolves.toMatchObject({ model: 'gpt-4o' });
    expect(adapters.direct).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret Ollama authentication failure as an outage', async () => {
    adapters.ollama.mockRejectedValue(new Error('Ollama Cloud request failed with status 401.'));
    await expect(outageFallback('general', messages, undefined, outage)).rejects.toThrow('status 401');
    expect(adapters.direct).not.toHaveBeenCalled();
  });

  it('rejects multimodal inputs and refuses circular unconfigured fallback', async () => {
    await expect(outageFallback('general', [{ role: 'user', content: [] }], undefined, outage))
      .rejects.toBe(outage);
    vi.stubEnv('OLLAMA_API_KEY', '');
    vi.stubEnv('OPENAI_DIRECT_API_KEY', '');
    await expect(outageFallback('general', messages, undefined, outage)).rejects.toBe(outage);
    expect(adapters.ollama).not.toHaveBeenCalled();
    expect(adapters.direct).not.toHaveBeenCalled();
  });
});
