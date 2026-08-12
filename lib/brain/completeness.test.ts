import { describe, expect, it } from 'vitest';

import {
  COMPLETENESS_SHIP_THRESHOLD,
  HARD_BLOCK_FIELD_IDS,
  REGISTRY_FIELDS,
  computeCompleteness,
  deriveStatus,
  describeBootstrap,
  scoredSet,
  type FieldStatus,
} from './completeness';

function statusesFor(ids: readonly string[], status: FieldStatus) {
  return Object.fromEntries(ids.map((id) => [id, status]));
}

const ALL_IDS = REGISTRY_FIELDS.map((f) => f.field_id);
const ALL_PREDICATES = [...new Set(REGISTRY_FIELDS.map((f) => f.applicability))];

describe('registry shape (Amendment 001-A.2)', () => {
  it('exposes exactly the six hard-block fields from Section 5.3', () => {
    expect([...HARD_BLOCK_FIELD_IDS].sort()).toEqual([
      'checkout_time',
      'door_code_or_entry_method',
      'maintenance_emergency_contact',
      'nearest_grocery',
      'parking',
      'wifi_password',
    ]);
  });

  it('excludes hidden system sections from the scored set', () => {
    const scored = scoredSet(ALL_PREDICATES);
    expect(scored.some((f) => f.system_section)).toBe(false);
    expect(REGISTRY_FIELDS.some((f) => f.system_section)).toBe(true);
  });

  it('excludes zero-weight fields from the scored set', () => {
    expect(scoredSet(ALL_PREDICATES).every((f) => f.gap_weight > 0)).toBe(true);
  });

  it('never scores a field whose applicability predicate is unmet', () => {
    const universal = scoredSet([]);
    const all = scoredSet(ALL_PREDICATES);
    expect(universal.length).toBeLessThan(all.length);
    expect(universal.every((f) => f.applicability === 'always')).toBe(true);
  });
});

describe('the 65% denominator (Amendment 001-A.1)', () => {
  it('is 0 with nothing filled in', () => {
    expect(computeCompleteness().pct).toBe(0);
  });

  it('is 100 with every applicable field satisfied', () => {
    const result = computeCompleteness({
      statuses: statusesFor(ALL_IDS, 'satisfied'),
      applicable: ALL_PREDICATES,
    });
    expect(result.pct).toBe(100);
    expect(result.gaps).toEqual([]);
  });

  it('reports numerator and denominator so the figure is auditable', () => {
    const result = computeCompleteness({ applicable: ALL_PREDICATES });
    const expected = scoredSet(ALL_PREDICATES).reduce((s, f) => s + f.gap_weight, 0);
    expect(result.denominator).toBeCloseTo(expected, 2);
    expect(result.numerator).toBe(0);
  });

  it('credits partial at exactly half of satisfied', () => {
    const partial = computeCompleteness({ statuses: statusesFor(ALL_IDS, 'partial') });
    expect(partial.pct).toBe(50);
  });

  it('removes not_applicable from the denominator instead of crediting it', () => {
    // The bug this clause exists to prevent: if not_applicable were credited as
    // 1.0, marking a field inapplicable would RAISE the score. It must not move
    // a score that is otherwise all-satisfied, and must not rescue a zero score.
    const heavy = 'parking';

    const naOnly = computeCompleteness({ statuses: { [heavy]: 'not_applicable' } });
    expect(naOnly.pct).toBe(0);

    const allSatisfied = computeCompleteness({ statuses: statusesFor(ALL_IDS, 'satisfied') });
    const withOneNa = computeCompleteness({
      statuses: { ...statusesFor(ALL_IDS, 'satisfied'), [heavy]: 'not_applicable' },
    });
    expect(withOneNa.pct).toBe(allSatisfied.pct);

    // And it shrinks the denominator rather than padding the numerator.
    expect(withOneNa.denominator).toBeLessThan(allSatisfied.denominator);
    expect(withOneNa.numerator).toBeLessThan(allSatisfied.numerator);
  });

  it('does not list a not_applicable field as a gap', () => {
    const result = computeCompleteness({ statuses: { parking: 'not_applicable' } });
    expect(result.gaps.some((g) => g.fieldId === 'parking')).toBe(false);
    expect(result.hardBlocksOutstanding.some((g) => g.fieldId === 'parking')).toBe(false);
  });

  it('weights heavier fields more', () => {
    const heavy = computeCompleteness({ statuses: { parking: 'satisfied' } });
    const light = computeCompleteness({ statuses: { smoking_policy: 'satisfied' } });
    expect(heavy.pct).toBeGreaterThan(light.pct);
  });

  it('returns 0 rather than NaN when nothing is applicable', () => {
    const result = computeCompleteness({
      statuses: statusesFor(ALL_IDS, 'not_applicable'),
    });
    expect(result.pct).toBe(0);
    expect(result.denominator).toBe(0);
  });

  it('orders gaps heaviest first so the next host question is the useful one', () => {
    const weights = computeCompleteness({ applicable: ALL_PREDICATES }).gaps.map((g) => g.gapWeight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });
});

describe('the publish gate (Amendment 001-A.4)', () => {
  it('blocks a property that clears 65% but misses a hard block', () => {
    // Satisfy everything except one hard block. Score is high; gate still holds.
    const statuses = statusesFor(ALL_IDS, 'satisfied');
    delete (statuses as Record<string, FieldStatus>).nearest_grocery;

    const result = computeCompleteness({ statuses, applicable: ALL_PREDICATES });
    expect(result.pct).toBeGreaterThan(COMPLETENESS_SHIP_THRESHOLD);
    expect(result.canPublish).toBe(false);
    expect(result.blockedReason).toBe('hard_blocks_outstanding');
    expect(result.hardBlocksOutstanding.map((g) => g.fieldId)).toEqual(['nearest_grocery']);
  });

  it('blocks a property with every hard block satisfied but a low score', () => {
    const result = computeCompleteness({
      statuses: statusesFor(HARD_BLOCK_FIELD_IDS, 'satisfied'),
      applicable: ALL_PREDICATES,
    });
    expect(result.hardBlocksOutstanding).toEqual([]);
    expect(result.pct).toBeLessThan(COMPLETENESS_SHIP_THRESHOLD);
    expect(result.canPublish).toBe(false);
    expect(result.blockedReason).toBe('below_threshold');
  });

  it('reports both when both gates fail', () => {
    expect(computeCompleteness().blockedReason).toBe('both');
  });

  it('permits publication only when both gates clear', () => {
    const result = computeCompleteness({
      statuses: statusesFor(ALL_IDS, 'satisfied'),
      applicable: ALL_PREDICATES,
    });
    expect(result.canPublish).toBe(true);
    expect(result.blockedReason).toBeNull();
  });

  it('treats a hard block at partial as outstanding, not satisfied', () => {
    const statuses = { ...statusesFor(ALL_IDS, 'satisfied'), parking: 'partial' as FieldStatus };
    const result = computeCompleteness({ statuses, applicable: ALL_PREDICATES });
    expect(result.canPublish).toBe(false);
    expect(result.hardBlocksOutstanding.map((g) => g.fieldId)).toEqual(['parking']);
  });
});

describe('domain rollup', () => {
  it('domain percentages reconcile with the overall figure', () => {
    const statuses = statusesFor(HARD_BLOCK_FIELD_IDS, 'satisfied');
    const result = computeCompleteness({ statuses, applicable: ALL_PREDICATES });
    const earned = result.domains.reduce((s, d) => s + d.earned, 0);
    const weight = result.domains.reduce((s, d) => s + d.weight, 0);
    expect(weight).toBeCloseTo(result.denominator, 1);
    expect((earned / weight) * 100).toBeCloseTo(result.pct, 1);
  });
});

describe('deriveStatus (Amendment 001-A.3)', () => {
  const withFallback = REGISTRY_FIELDS.find((f) => f.requires_on_failure)!;
  const withoutFallback = REGISTRY_FIELDS.find((f) => !f.requires_on_failure && f.gap_weight > 0)!;

  it('is missing with no value', () => {
    expect(deriveStatus(withFallback, false, true)).toBe('missing');
  });

  it('is partial when the required fallback is empty', () => {
    expect(deriveStatus(withFallback, true, false)).toBe('partial');
  });

  it('is satisfied when value and required fallback are both present', () => {
    expect(deriveStatus(withFallback, true, true)).toBe('satisfied');
  });

  it('ignores the fallback for fields that do not require one', () => {
    expect(deriveStatus(withoutFallback, true, false)).toBe('satisfied');
  });
});

describe('describeBootstrap (Amendment 001-A.5)', () => {
  it('quotes the same scale as the ship threshold', () => {
    const result = computeCompleteness({
      statuses: statusesFor(HARD_BLOCK_FIELD_IDS, 'satisfied'),
      applicable: ALL_PREDICATES,
    });
    const copy = describeBootstrap(result);
    expect(copy).toContain(`${result.pct}%`);
    expect(copy).toContain(`${COMPLETENESS_SHIP_THRESHOLD}%`);
  });

  it('does not tell a host they still have work to do once past the threshold', () => {
    const result = computeCompleteness({
      statuses: statusesFor(ALL_IDS, 'satisfied'),
      applicable: ALL_PREDICATES,
    });
    expect(describeBootstrap(result)).toContain('past the');
  });
});
