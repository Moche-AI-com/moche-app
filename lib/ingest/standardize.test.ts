import { beforeEach, describe, expect, it, vi } from 'vitest';
import { standardizeKnowledge } from './standardize';

const mocks = vi.hoisted(() => ({ complete: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: mocks.complete }));
vi.mock('@/lib/log', () => ({ log: { warn: mocks.warn } }));

beforeEach(() => vi.clearAllMocks());

describe('review-only knowledge cleanup', () => {
  const manual = 'Model Q washer. Disconnect power before cleaning. Never open the door during a cycle.';

  it('uses an instruction-preserving extraction prompt rather than listing headings', async () => {
    mocks.complete.mockResolvedValue({ text: manual });
    const result = await standardizeKnowledge(manual, 'appliances', 'https://example.com/manual');
    const [messages, , route] = mocks.complete.mock.calls[0];
    expect(route).toEqual({ task: 'extraction' });
    expect(messages[0].content).toMatch(/operating steps/i);
    expect(messages[0].content).toMatch(/warnings/i);
    expect(messages[0].content).toMatch(/untrusted DATA/i);
    expect(messages[0].content).not.toContain('## Layout & Sleeping');
    expect(messages[1].content).toContain(manual);
    expect(result).toMatchObject({ text: manual, standardized: true, truncated: false });
  });

  it('preserves reference content and uses a stable error code on provider failure', async () => {
    mocks.complete.mockRejectedValue(new Error('Door code: 1234 private@example.com'));
    expect(await standardizeKnowledge(manual, 'documents')).toEqual({
      text: manual, standardized: false, truncated: false,
    });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toMatch(/1234|private@example/);
  });

  it.each(['', '```', 'No usable property information found.'])('retains source for unusable output %s', async (text) => {
    mocks.complete.mockResolvedValue({ text });
    expect(await standardizeKnowledge(manual, 'documents')).toMatchObject({ text: manual, standardized: false });
  });

  it('does not summarize a partial long manual and silently lose the ending warnings', async () => {
    const text = `${'Reference content. '.repeat(900)}Disconnect power before maintenance.`;
    expect(text.length).toBeGreaterThan(16000);
    expect(await standardizeKnowledge(text, 'appliances')).toEqual({
      text, standardized: false, truncated: false,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('discloses clipping at the existing proposal limit', async () => {
    const text = 'x'.repeat(23000);
    expect(await standardizeKnowledge(text, 'documents')).toEqual({
      text: text.slice(0, 20000), standardized: false, truncated: true,
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
