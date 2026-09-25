import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ openrouterApiKey: 'test-key' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));
import { decideChoice } from './jevDecisions';

const input = {
  state: { message: 'The heating is broken.' },
  instructions: 'Which category best fits this request?',
  criteria: { maintenance: 'An appliance or fixture needs repair.', other: 'Any other request.' },
};
const answer = {
  model: 'typesafe/jev-1.13-20260917',
  answers: { label: { type: 'choice', choice: 'maintenance', confidence: 0.9,
    probabilities: { maintenance: 0.9, other: 0.1 } } },
};

describe('Jev decisions adapter', () => {
  beforeEach(() => { env.openrouterApiKey = 'test-key'; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('posts to the Decisions API without modifying chat routing', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => answer });
    vi.stubGlobal('fetch', fetcher);
    await expect(decideChoice(input)).resolves.toMatchObject({ choice: 'maintenance', confidence: 0.9 });
    expect(fetcher.mock.calls[0][0]).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(fetcher.mock.calls[0][1].redirect).toBe('error');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'typesafe/jev-1.13',
      questions: { label: { type: 'choice' } } });
  });

  it('redacts personal information from state, instructions, and criteria', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => answer });
    vi.stubGlobal('fetch', fetcher);
    await decideChoice({
      state: { message: 'Reach me at guest@example.com' },
      instructions: 'Email host@example.com with the category.',
      criteria: { maintenance: 'Ask owner@example.com about repair.', other: 'Any other request.' },
    });
    const body = fetcher.mock.calls[0][1].body as string;
    expect(body).not.toContain('guest@example.com');
    expect(body).not.toContain('host@example.com');
    expect(body).not.toContain('owner@example.com');
    expect(body).toContain('[redacted-email]');
  });

  it('fails before sending when the key is missing', async () => {
    env.openrouterApiKey = '';
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(decideChoice(input)).rejects.toThrow('Jev is not configured.');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects unknown labels and malformed probabilities', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      ...answer, answers: { label: { ...answer.answers.label, choice: 'unknown' } },
    }) });
    vi.stubGlobal('fetch', fetcher);
    await expect(decideChoice(input)).rejects.toThrow('Malformed Jev response.');
  });

  it('surfaces authentication failure without downgrading to another model', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetcher);
    await expect(decideChoice(input)).rejects.toThrow('Jev decision failed: 401');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
