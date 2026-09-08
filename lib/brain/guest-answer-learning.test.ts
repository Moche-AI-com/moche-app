import { beforeEach, describe, expect, it, vi } from 'vitest';
const completion = vi.hoisted(() => vi.fn());
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: completion }));
import { normalizeGuestAnswerForBrain } from './guest-answer-learning';

const input = {
  question: 'Where do I find Wi-Fi access?',
  hostAnswer: 'The Wi-Fi password is printed on the welcome card in the study.',
  threadMessages: [],
};
beforeEach(() => {
  completion.mockReset().mockResolvedValue({
    model: 'openai/gpt-4o',
    text: JSON.stringify({
      question: input.question, answer: input.hostAnswer,
      category: 'Connectivity', section: 'Connectivity', confidence: 0.9,
    }),
  });
});
describe('guest reply learning', () => {
  it('uses central brain_ops routing and canonical section/category names', async () => {
    const result = await normalizeGuestAnswerForBrain(input);
    expect(completion).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), { task: 'brain_ops' });
    expect(result).toMatchObject({ category: 'core', section: 'connectivity', model: 'openai/gpt-4o' });
    expect(result.answer).toBe(input.hostAnswer);
  });
  it('propagates strong-tier failure instead of trying a general provider', async () => {
    completion.mockRejectedValue(new Error('strong tier unavailable'));
    await expect(normalizeGuestAnswerForBrain(input)).rejects.toThrow('strong tier unavailable');
    expect(completion).toHaveBeenCalledTimes(1);
  });
  it('rejects a generated credential rather than returning it for approval', async () => {
    completion.mockResolvedValue({
      model: 'openai/gpt-4o',
      text: JSON.stringify({ question: input.question, answer: 'The Wi-Fi password is Secret987!', category: 'core' }),
    });
    await expect(normalizeGuestAnswerForBrain(input)).rejects.toThrow(/credential/i);
  });
  it('does not let an internal-only classification become guest knowledge', async () => {
    completion.mockResolvedValue({
      model: 'openai/gpt-4o',
      text: JSON.stringify({ question: input.question, answer: 'Private host accounting and operational notes.', category: 'internal_notes' }),
    });
    await expect(normalizeGuestAnswerForBrain(input)).rejects.toThrow(/guest/i);
  });
  it('cannot replace host Wi-Fi guidance with a model-invented location', async () => {
    completion.mockResolvedValue({
      model: 'openai/gpt-4o',
      text: JSON.stringify({ question: input.question, answer: 'The Wi-Fi password is on the fridge.', category: 'core' }),
    });
    const result = await normalizeGuestAnswerForBrain(input);
    expect(result.answer).toBe(input.hostAnswer);
    expect(result.answer).not.toContain('fridge');
  });
  it('rejects an unlabelled password reply before any provider sees it', async () => {
    await expect(normalizeGuestAnswerForBrain({ ...input, hostAnswer: 'Secret987!' })).rejects.toThrow(/credential/i);
    expect(completion).not.toHaveBeenCalled();
  });
  it('never forwards old unlabelled Wi-Fi credentials from the attached thread', async () => {
    await normalizeGuestAnswerForBrain({
      ...input, threadMessages: [{ role: 'assistant', content: 'Secret987!' }],
    });
    expect(JSON.stringify(completion.mock.calls)).not.toContain('Secret987!');
  });
});
