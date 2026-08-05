import { describe, it, expect } from 'vitest';
import { periodWindow } from './usage';

describe('periodWindow', () => {
  it('derives the window backwards from the Stripe period end', () => {
    const { start, end } = periodWindow('2026-09-15T00:00:00.000Z');
    expect(start.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(end?.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('handles a month boundary without producing a window in the future', () => {
    const { start, end } = periodWindow('2026-03-01T00:00:00.000Z');
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(start.getTime()).toBeLessThan(end!.getTime());
  });

  it('falls back to the calendar month with no period end', () => {
    const { start, end } = periodWindow(null);
    const now = new Date();
    expect(start.getUTCDate()).toBe(1);
    expect(start.getUTCMonth()).toBe(now.getUTCMonth());
    expect(start.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(end).toBeNull();
  });

  it('never returns a start after the end for any month of the year', () => {
    // Guards the classic setUTCMonth overflow: subtracting a month from the 31st
    // must not roll forward past the end date.
    for (let m = 0; m < 12; m++) {
      const endIso = new Date(Date.UTC(2026, m, 28)).toISOString();
      const { start, end } = periodWindow(endIso);
      expect(start.getTime()).toBeLessThan(end!.getTime());
    }
  });
});
