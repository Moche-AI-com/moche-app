import { describe, it, expect } from 'vitest';
import { parseLifecycleView, lifecycleStatusFor } from './lifecycle';

describe('parseLifecycleView', () => {
  it('returns past only for the exact literal', () => {
    expect(parseLifecycleView('past')).toBe('past');
  });

  it('defaults to active for the explicit active value', () => {
    expect(parseLifecycleView('active')).toBe('active');
  });

  it('defaults to active when the param is absent', () => {
    expect(parseLifecycleView(undefined)).toBe('active');
  });

  it('defaults to active for unrecognised values rather than rendering nothing', () => {
    for (const raw of ['', 'PAST', 'archived', 'null', 'undefined', '1', 'past ']) {
      expect(parseLifecycleView(raw)).toBe('active');
    }
  });

  it('reads the first entry when the query string repeats the param', () => {
    // Next.js hands back an array for `?view=past&view=active`.
    expect(parseLifecycleView(['past', 'active'])).toBe('past');
    expect(parseLifecycleView(['active', 'past'])).toBe('active');
  });

  it('defaults to active for an empty array', () => {
    expect(parseLifecycleView([])).toBe('active');
  });
});

describe('lifecycleStatusFor', () => {
  it('maps the UI view onto the database enum, not the UI wording', () => {
    // The column is a generated lifecycle_state enum: 'active' | 'archived'.
    // Sending 'past' straight to Postgres would be a 22P02 invalid input error.
    expect(lifecycleStatusFor('past')).toBe('archived');
    expect(lifecycleStatusFor('active')).toBe('active');
  });
});
