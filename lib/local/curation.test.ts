import { describe, it, expect } from 'vitest';
import { deriveCurationStatus, statusTransitionPatch, computeCategoryCoverage } from './curation';

describe('deriveCurationStatus', () => {
  it('is unreviewed when neither approved nor hidden', () => {
    expect(deriveCurationStatus({ approved: false, hidden: false, host_preference: 'neutral' })).toBe('unreviewed');
  });

  it('is rejected whenever hidden, regardless of approved/preference', () => {
    expect(deriveCurationStatus({ approved: true, hidden: true, host_preference: 'loved' })).toBe('rejected');
    expect(deriveCurationStatus({ approved: false, hidden: true, host_preference: 'neutral' })).toBe('rejected');
  });

  it('is favorite when approved, visible, and loved', () => {
    expect(deriveCurationStatus({ approved: true, hidden: false, host_preference: 'loved' })).toBe('favorite');
  });

  it('is approved when approved, visible, and not loved (neutral or disliked)', () => {
    expect(deriveCurationStatus({ approved: true, hidden: false, host_preference: 'neutral' })).toBe('approved');
    expect(deriveCurationStatus({ approved: true, hidden: false, host_preference: 'disliked' })).toBe('approved');
  });

  it('treats a null host_preference as not loved', () => {
    expect(deriveCurationStatus({ approved: true, hidden: false, host_preference: null })).toBe('approved');
  });
});

describe('statusTransitionPatch', () => {
  it('round-trips through deriveCurationStatus for every target', () => {
    const targets = ['unreviewed', 'approved', 'favorite', 'rejected'] as const;
    for (const target of targets) {
      const patch = statusTransitionPatch(target);
      expect(deriveCurationStatus(patch)).toBe(target);
    }
  });
});

describe('computeCategoryCoverage', () => {
  it('counts categories with at least one live pick as covered', () => {
    const live = [{ category: 'restaurant' }, { category: 'restaurant' }, { category: 'cafe' }];
    const result = computeCategoryCoverage(live, ['restaurant', 'cafe', 'grocery']);
    expect(result.covered).toBe(2);
    expect(result.total).toBe(3);
    expect(result.byCategory).toEqual([
      { category: 'restaurant', approvedCount: 2 },
      { category: 'cafe', approvedCount: 1 },
      { category: 'grocery', approvedCount: 0 },
    ]);
  });

  it('returns zero coverage for an empty live set', () => {
    const result = computeCategoryCoverage([], ['restaurant', 'cafe']);
    expect(result.covered).toBe(0);
    expect(result.total).toBe(2);
  });
});
