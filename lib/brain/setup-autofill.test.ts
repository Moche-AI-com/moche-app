import { describe, expect, it } from 'vitest';
import { shouldAutofill } from './setup-autofill';

describe('shouldAutofill', () => {
  it('allows direct filing only for an empty draft property', () => {
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: 0 })).toBe(true);
  });

  it('refuses a draft property that already has a non-deleted Brain item', () => {
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: 1 })).toBe(false);
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: 4 })).toBe(false);
  });

  it('refuses all non-draft states even when the Brain is empty', () => {
    expect(shouldAutofill({ status: 'live', existingBrainItemCount: 0 })).toBe(false);
    expect(shouldAutofill({ status: 'paused', existingBrainItemCount: 0 })).toBe(false);
    expect(shouldAutofill({ status: 'archived', existingBrainItemCount: 0 })).toBe(false);
  });

  it('does not treat an invalid negative count as an empty Brain', () => {
    expect(shouldAutofill({ status: 'draft', existingBrainItemCount: -1 })).toBe(false);
  });
});
