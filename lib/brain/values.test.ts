import { describe, it, expect } from 'vitest';
import { deriveStatuses, type ActiveValue } from './values';
import {
  APPLICABILITY_PREDICATES,
  APPLICABILITY_LABELS,
  REGISTRY_FIELDS,
  computeCompleteness,
  fieldsGatedBy,
  scoredSet,
} from './completeness';

function val(fieldId: string): ActiveValue {
  return {
    fieldId,
    value: 'x',
    hasSecretRef: false,
    source: 'host_verified',
    confidence: 1,
    verifiedAt: null,
    ttlExpiresAt: null,
  };
}

describe('deriveStatuses', () => {
  it('marks every registry field missing when nothing is stored', () => {
    const statuses = deriveStatuses([]);
    expect(Object.keys(statuses).length).toBe(REGISTRY_FIELDS.length);
    expect(new Set(Object.values(statuses))).toEqual(new Set(['missing']));
  });

  it('credits a field with no on_failure requirement as satisfied', () => {
    const plain = REGISTRY_FIELDS.find((f) => !f.requires_on_failure && f.gap_weight > 0);
    expect(plain).toBeDefined();
    const statuses = deriveStatuses([val(plain!.field_id)]);
    expect(statuses[plain!.field_id]).toBe('satisfied');
  });

  it('half-credits a field whose required fallback is absent', () => {
    // wifi_password requires wifi_troubleshooting behind it. A credential with no
    // "what if it does not work" procedure is a support call waiting to happen,
    // which is exactly what partial credit is for.
    const statuses = deriveStatuses([val('wifi_password')]);
    expect(statuses.wifi_password).toBe('partial');
  });

  it('fully credits the same field once its fallback exists', () => {
    const statuses = deriveStatuses([val('wifi_password'), val('wifi_troubleshooting')]);
    expect(statuses.wifi_password).toBe('satisfied');
  });
});

describe('completeness from stored values', () => {
  it('scores zero on an empty property', () => {
    const result = computeCompleteness({ statuses: deriveStatuses([]), applicable: [] });
    expect(result.numerator).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.canPublish).toBe(false);
  });

  it('never exceeds 100 when every scored field is satisfied', () => {
    const applicable = [...APPLICABILITY_PREDICATES];
    const all = scoredSet(applicable).map((f) => val(f.field_id));
    const result = computeCompleteness({ statuses: deriveStatuses(all), applicable });
    expect(result.pct).toBe(100);
    expect(result.hardBlocksOutstanding).toEqual([]);
    expect(result.canPublish).toBe(true);
  });

  it('asserting a predicate can only lower or hold the score, never raise it', () => {
    // Guards against the inverse bug: if declaring a hot tub somehow *increased*
    // completeness, hosts would be rewarded for adding obligations they have not met.
    const values = deriveStatuses([]);
    const base = computeCompleteness({ statuses: values, applicable: [] });
    const withAll = computeCompleteness({ statuses: values, applicable: [...APPLICABILITY_PREDICATES] });
    expect(withAll.denominator).toBeGreaterThan(base.denominator);
    expect(withAll.pct).toBeLessThanOrEqual(base.pct);
  });

  it('keeps unasserted predicate fields out of the denominator entirely', () => {
    const poolFields = fieldsGatedBy('has_pool');
    expect(poolFields.length).toBeGreaterThan(0);
    const without = computeCompleteness({ statuses: deriveStatuses([]), applicable: [] });
    const scoredIds = new Set(scoredSet([]).map((f) => f.field_id));
    for (const f of poolFields) expect(scoredIds.has(f.field_id)).toBe(false);
    expect(without.gaps.some((g) => g.fieldId === poolFields[0].field_id)).toBe(false);
  });
});

describe('applicability predicate metadata', () => {
  it('excludes the implicit always predicate', () => {
    expect(APPLICABILITY_PREDICATES).not.toContain('always');
  });

  it('has host-facing copy for every predicate', () => {
    for (const p of APPLICABILITY_PREDICATES) {
      expect(APPLICABILITY_LABELS[p], `missing label for ${p}`).toBeTruthy();
    }
  });

  it('every predicate actually gates at least one scored field', () => {
    // A predicate with no fields behind it is a question that costs the host a
    // click and changes nothing.
    for (const p of APPLICABILITY_PREDICATES) {
      expect(fieldsGatedBy(p).length, `${p} gates nothing`).toBeGreaterThan(0);
    }
  });
});
