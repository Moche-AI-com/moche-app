import { describe, expect, it } from 'vitest';
import { detectOneOffAnswer, oneOffReason } from './one-off';

describe('detectOneOffAnswer', () => {
  it('flags stay-scoped exceptions', () => {
    expect(detectOneOffAnswer("Yeah, late checkout's fine for this stay.").oneOff).toBe(true);
    expect(detectOneOffAnswer('Just this once, sure.').oneOff).toBe(true);
    expect(detectOneOffAnswer('They can park in the driveway tonight only.').oneOff).toBe(false);
    expect(detectOneOffAnswer('For tonight, the grill is fine to use.').oneOff).toBe(true);
    expect(detectOneOffAnswer('As an exception for this guest, yes.').oneOff).toBe(true);
    expect(detectOneOffAnswer('One-off: they can bring the trailer.').oneOff).toBe(true);
  });

  it('passes standing policy through', () => {
    expect(detectOneOffAnswer('Late checkout is always fine — 1pm.')).toEqual({ oneOff: false, marker: null });
    expect(detectOneOffAnswer('The grill is on the deck; propane is under the sink.')).toEqual({ oneOff: false, marker: null });
    expect(detectOneOffAnswer('Guests may use the kayaks any day of the week.')).toEqual({ oneOff: false, marker: null });
  });
});

describe('oneOffReason', () => {
  it('explains the hold in host terms', () => {
    expect(oneOffReason('this once')).toContain('Held back');
    expect(oneOffReason('this once')).toContain('this once');
  });
});
