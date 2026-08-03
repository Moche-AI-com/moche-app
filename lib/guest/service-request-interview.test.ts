import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateResult } from '@/lib/ai/provider';

const routedCompletion = vi.fn((..._args: unknown[]) => Promise.resolve({} as GenerateResult));
vi.mock('@/lib/router/modelRouter', () => ({
  routedCompletion: (...args: unknown[]) => routedCompletion(...args),
}));

import {
  runSafetyTriage,
  runInterviewTurn,
  INTERVIEW_MAX_QUESTIONS,
  type InterviewEntry,
} from './service-request-interview';

beforeEach(() => {
  routedCompletion.mockReset();
});

describe('runSafetyTriage', () => {
  it('flags a gas smell and returns a guest-safe instruction', () => {
    const result = runSafetyTriage('I smell gas in the kitchen');
    expect(result?.flags).toContain('gas_smell');
    expect(result?.guestMessage).toMatch(/leave the unit/i);
  });

  it('flags active flooding', () => {
    expect(runSafetyTriage('water is gushing from under the sink')?.flags).toContain('active_flooding');
  });

  it('flags a lockout', () => {
    expect(runSafetyTriage("I'm locked out of the unit")?.flags).toContain('lockout');
  });

  it('flags a smoke or CO alarm mention', () => {
    expect(runSafetyTriage('the carbon monoxide alarm is going off')?.flags).toContain('smoke_co_alarm');
  });

  it('can match more than one trigger at once', () => {
    const result = runSafetyTriage('water is flooding the bathroom and I smell gas too');
    expect(result?.flags).toEqual(expect.arrayContaining(['active_flooding', 'gas_smell']));
  });

  it('returns null for an ordinary, non-safety report', () => {
    expect(runSafetyTriage('the doorknob on the bedroom is loose')).toBeNull();
  });
});

describe('runInterviewTurn', () => {
  it('returns a question turn on a well-formed model response', async () => {
    routedCompletion.mockResolvedValue({
      text: JSON.stringify({ type: 'question', question: 'Where is the leak coming from?', choices: ['Sink', 'Ceiling'] }),
      model: 'test',
    } as GenerateResult);

    const turn = await runInterviewTurn('the sink is leaking', []);
    expect(turn.type).toBe('question');
    if (turn.type === 'question') {
      expect(turn.question).toMatch(/leak/i);
      expect(turn.choices).toEqual(['Sink', 'Ceiling']);
    }
    expect(routedCompletion).toHaveBeenCalledTimes(1);
    const routeArg = routedCompletion.mock.calls[0][2];
    expect(routeArg).toEqual({ task: 'concierge' });
  });

  it('strips markdown code fences before parsing', async () => {
    routedCompletion.mockResolvedValue({
      text: '```json\n{"type":"question","question":"Is it still leaking?"}\n```',
      model: 'test',
    } as GenerateResult);

    const turn = await runInterviewTurn('the sink is leaking', []);
    expect(turn.type).toBe('question');
  });

  it('returns a final report turn when the model finalizes', async () => {
    routedCompletion.mockResolvedValue({
      text: JSON.stringify({
        type: 'final',
        report: {
          category: 'maintenance',
          subcategory: 'kitchen sink leak',
          severity: 'medium',
          locationNote: 'under the kitchen sink',
          likelyCauses: ['worn washer'],
          suggestedParts: ['sink washer'],
          accessInstructions: 'no pets, ok anytime',
          guestAvailability: 'after 2pm today',
          summary: 'Guest reports a slow leak under the kitchen sink, worsening over the last day.',
        },
      }),
      model: 'test',
    } as GenerateResult);

    const turn = await runInterviewTurn('the sink is leaking', [{ role: 'assistant', text: 'q1' }, { role: 'guest', text: 'a1' }]);
    expect(turn.type).toBe('final');
    if (turn.type === 'final') {
      expect(turn.report.category).toBe('maintenance');
      expect(turn.report.severity).toBe('medium');
    }
  });

  it('falls back to a generic follow-up question on unparseable model output', async () => {
    routedCompletion.mockResolvedValue({ text: 'not json at all', model: 'test' } as GenerateResult);
    const turn = await runInterviewTurn('the sink is leaking', []);
    expect(turn.type).toBe('question');
  });

  it('falls back to a minimal final report on unparseable output once the question cap is hit', async () => {
    routedCompletion.mockResolvedValue({ text: 'not json at all', model: 'test' } as GenerateResult);
    const transcript: InterviewEntry[] = Array.from({ length: INTERVIEW_MAX_QUESTIONS }, (_, i) => [
      { role: 'assistant' as const, text: `q${i}` },
      { role: 'guest' as const, text: `a${i}` },
    ]).flat();

    const turn = await runInterviewTurn('the sink is leaking', transcript);
    expect(turn.type).toBe('final');
    if (turn.type === 'final') {
      expect(turn.report.summary).toContain('leaking');
    }
  });

  it('falls back to a generic question when the completion call throws', async () => {
    routedCompletion.mockRejectedValue(new Error('network down'));
    const turn = await runInterviewTurn('the sink is leaking', []);
    expect(turn.type).toBe('question');
  });

  it('instructs the model to finalize once the question cap is reached', async () => {
    routedCompletion.mockResolvedValue({
      text: JSON.stringify({
        type: 'final',
        report: {
          category: 'other',
          severity: 'low',
          summary: 'fine',
        },
      }),
      model: 'test',
    } as GenerateResult);
    const transcript: InterviewEntry[] = Array.from({ length: INTERVIEW_MAX_QUESTIONS }, (_, i) => [
      { role: 'assistant' as const, text: `q${i}` },
      { role: 'guest' as const, text: `a${i}` },
    ]).flat();

    await runInterviewTurn('the sink is leaking', transcript);
    const messages = routedCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages.some((m) => m.role === 'system' && /reached the question cap/i.test(m.content))).toBe(true);
  });
});
