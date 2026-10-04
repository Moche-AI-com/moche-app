import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GenerateResult } from '@/lib/ai/provider';

const warn = vi.fn();
vi.mock('@/lib/log', () => ({ log: { warn: (...args: unknown[]) => warn(...args) } }));
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
  warn.mockReset();
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

  it.each(['no heat', 'no AC'])('does not invent weather or supplies for %s', (text) => {
    const result = runSafetyTriage(text);
    expect(result).not.toBeNull();
    expect(result?.guestMessage).not.toMatch(/blankets|fans|given the cold|given the heat|in the unit if/i);
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
    // Approved routing upgrade: diagnostic guest interviews require the strong
    // guest-origin tier, never routine concierge or an ungoverned general task.
    expect(routeArg).toEqual({ task: 'concierge_complex' });
    const prompt = (routedCompletion.mock.calls[0][0] as Array<{ content: string }>)[0].content;
    expect(prompt).toContain('Do not invent property supplies');
    expect(prompt).toContain('including in another language');
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

  it.each([
    'I smell gas in the kitchen',
    'Water is gushing from the ceiling',
    'The carbon monoxide alarm is going off',
    'The outlet is sparking',
  ])('immediately finalizes a dangerous latest follow-up without AI: %s', async (text) => {
    routedCompletion.mockRejectedValue(new Error('provider outage'));
    const turn = await runInterviewTurn('loose doorknob', [
      { role: 'assistant', text: 'Where is it?' }, { role: 'guest', text },
    ]);
    expect(turn).toMatchObject({
      type: 'final', report: { category: 'safety', severity: 'critical' },
      safety: { flags: expect.any(Array), guestMessage: expect.any(String) },
    });
    expect(routedCompletion).not.toHaveBeenCalled();
    if (turn.type === 'final') expect(turn.report.summary).toContain(text);
  });

  it('protects direct shared-engine callers on the initial turn too', async () => {
    const turn = await runInterviewTurn('I smell gas', []);
    expect(turn).toMatchObject({ type: 'final', report: { severity: 'critical' } });
    expect(routedCompletion).not.toHaveBeenCalled();
  });

  it('does not treat assistant safety questions as a guest emergency report', async () => {
    routedCompletion.mockResolvedValue({ text: '{"type":"question","question":"Where is the knob?"}', model: 'test' });
    const turn = await runInterviewTurn('loose doorknob', [
      { role: 'assistant', text: 'Do you smell gas?' }, { role: 'guest', text: 'No, only the loose knob.' },
    ]);
    expect(turn.type).toBe('question');
    expect(routedCompletion).toHaveBeenCalledOnce();
  });

  it.each(['valid-question', 'malformed', 'outage'])('enforces the cap and preserves later guest facts on %s', async (mode) => {
    if (mode === 'outage') routedCompletion.mockRejectedValue(new Error('unavailable'));
    else routedCompletion.mockResolvedValue({
      text: mode === 'valid-question' ? '{"type":"question","question":"One more question?"}' : 'not JSON',
      model: 'test',
    });
    const transcript: InterviewEntry[] = Array.from({ length: INTERVIEW_MAX_QUESTIONS }, (_, i) => [
      { role: 'assistant' as const, text: `q${i}` }, { role: 'guest' as const, text: `answer ${i}` },
    ]).flat();
    transcript.push({ role: 'guest', text: 'Bedroom 2; please enter only after 16:30. Dog inside.' });
    const turn = await runInterviewTurn('loose doorknob', transcript);
    expect(turn.type).toBe('final');
    if (turn.type === 'final') {
      expect(turn.report.summary).toContain('loose doorknob');
      expect(turn.report.summary).toContain('Bedroom 2; please enter only after 16:30. Dog inside.');
      expect(turn.report.likelyCauses).toEqual([]);
      expect(turn.report.suggestedParts).toEqual([]);
    }
  });

  it('keeps the newest guest detail when the fallback summary needs truncation', async () => {
    routedCompletion.mockRejectedValue(new Error('unavailable'));
    const transcript: InterviewEntry[] = Array.from({ length: INTERVIEW_MAX_QUESTIONS }, () => ({
      role: 'assistant', text: 'Which room?',
    }));
    transcript.push({ role: 'guest', text: 'Do not enter before 18:45; dog inside.' });
    const turn = await runInterviewTurn(`Loose knob. ${'Original description. '.repeat(80)}`, transcript);
    if (turn.type !== 'final') throw new Error('Expected final report');
    expect(turn.report.summary.length).toBeLessThanOrEqual(400);
    expect(turn.report.summary).toContain('Loose knob.');
    expect(turn.report.summary).toContain('Do not enter before 18:45; dog inside.');
  });

  it('never logs provider exceptions containing guest text', async () => {
    routedCompletion.mockRejectedValue(new Error('PRIVATE_GUEST_BODY at Synthetic Road 17'));
    await runInterviewTurn('loose doorknob', []);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE_GUEST_BODY');
  });

  it.each(['safety', 'emergency'])('attaches local urgent guidance to a critical model %s report in another language', async (category) => {
    routedCompletion.mockResolvedValue({
      text: JSON.stringify({ type: 'final', report: { category, severity: 'critical', summary: 'Urgent guest report requires host attention.' } }),
      model: 'test',
    });
    const turn = await runInterviewTurn('Huele a gas en la cocina.', []);
    expect(turn).toMatchObject({
      type: 'final',
      report: { category, severity: 'critical' },
      safety: { flags: ['urgent_report'], guestMessage: expect.stringMatching(/emergency services/i) },
    });
    expect(routedCompletion).toHaveBeenCalledOnce();
    expect(routedCompletion.mock.calls[0][1]).toEqual({ temperature: 0.3, maxTokens: 1200 });
  });
});
