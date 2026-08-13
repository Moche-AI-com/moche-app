import { describe, it, expect } from 'vitest';
import { buildCoverageMap } from './coverage';
import { REGISTRY_FIELDS, HARD_BLOCK_FIELD_IDS, computeCompleteness, scoredSet, type FieldStatus } from './completeness';

function statusesWhere(fn: (fieldId: string) => FieldStatus): Record<string, FieldStatus> {
  return Object.fromEntries(REGISTRY_FIELDS.map((f) => [f.field_id, fn(f.field_id)]));
}

function build(statuses: Record<string, FieldStatus>, applicable: string[] = []) {
  const completeness = computeCompleteness({ statuses, applicable });
  return buildCoverageMap({ statuses, applicable, domains: completeness.domains });
}

describe('buildCoverageMap', () => {
  it('covers the whole scored set exactly once', () => {
    const view = build(statusesWhere(() => 'missing'));
    const ids = view.domains.flatMap((d) => d.fields.map((f) => f.fieldId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(scoredSet([]).length);
  });

  it('separates a missing hard block from an ordinary gap', () => {
    const view = build(statusesWhere(() => 'missing'));
    const nodes = view.domains.flatMap((d) => d.fields);
    for (const id of HARD_BLOCK_FIELD_IDS) {
      const node = nodes.find((n) => n.fieldId === id);
      if (!node) continue; // predicate-gated hard blocks may be out of the scored set
      expect(node.state, id).toBe('blocking');
    }
    expect(view.totals.blocking).toBeGreaterThan(0);
    expect(nodes.filter((n) => !n.hardBlock).every((n) => n.state === 'missing')).toBe(true);
  });

  it('counts states so they sum to the node count', () => {
    const view = build(
      statusesWhere((id) => (HARD_BLOCK_FIELD_IDS.includes(id) ? 'missing' : id.length % 2 === 0 ? 'satisfied' : 'partial')),
    );
    const total = Object.values(view.totals).reduce((a, b) => a + b, 0);
    expect(total).toBe(view.domains.reduce((a, d) => a + d.fields.length, 0));
    expect(view.totals.satisfied).toBeGreaterThan(0);
    expect(view.totals.partial).toBeGreaterThan(0);
  });

  it('excludes not_applicable fields from the map rather than colouring them', () => {
    const target = scoredSet([])[0].field_id;
    const view = build(statusesWhere((id) => (id === target ? 'not_applicable' : 'satisfied')));
    const ids = view.domains.flatMap((d) => d.fields.map((f) => f.fieldId));
    expect(ids).not.toContain(target);
    expect(view.notApplicableCount).toBeGreaterThan(0);
  });

  it('keeps domain order stable as fields get filled in', () => {
    const empty = build(statusesWhere(() => 'missing')).domains.map((d) => d.domain);
    const full = build(statusesWhere(() => 'satisfied')).domains.map((d) => d.domain);
    expect(full).toEqual(empty);
  });

  it('produces layout coordinates inside the unit circle', () => {
    const view = build(statusesWhere(() => 'missing'));
    for (const d of view.domains) {
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
      for (const f of d.fields) expect(Math.hypot(f.x, f.y)).toBeCloseTo(1, 6);
    }
  });

  it('mirrors the completeness domain percentages rather than recomputing them', () => {
    const statuses = statusesWhere((id) => (HARD_BLOCK_FIELD_IDS.includes(id) ? 'missing' : 'satisfied'));
    const completeness = computeCompleteness({ statuses, applicable: [] });
    const view = buildCoverageMap({ statuses, applicable: [], domains: completeness.domains });
    for (const d of view.domains) {
      const source = completeness.domains.find((c) => c.domain === d.domain);
      expect(d.pct, d.domain).toBe(source?.pct ?? 0);
    }
  });

  it('reports a gap count per domain matching its non-satisfied nodes', () => {
    const view = build(statusesWhere((id) => (HARD_BLOCK_FIELD_IDS.includes(id) ? 'missing' : 'satisfied')));
    for (const d of view.domains) {
      expect(d.gapCount).toBe(d.fields.filter((f) => f.state !== 'satisfied').length);
    }
  });

  it('attributes each not-applicable field to its own domain', () => {
    // Nothing asserted, so every predicate-gated field is out of scope. The per-domain
    // counts must add up to the headline count, or the UI shows a total it cannot explain.
    const view = build(statusesWhere(() => 'missing'));
    const perDomain =
      view.domains.reduce((a, d) => a + d.notApplicableCount, 0) +
      view.notApplicableDomains.reduce((a, d) => a + d.count, 0);
    expect(perDomain).toBe(view.notApplicableCount);
    expect(view.notApplicableCount).toBeGreaterThan(0);
  });

  it('lands a single not_applicable declaration in the domain that owns the field', () => {
    const target = scoredSet([])[0];
    const view = build(statusesWhere((id) => (id === target.field_id ? 'not_applicable' : 'satisfied')));
    const owner = view.domains.find((d) => d.domain === target.domain);
    expect(owner, target.domain).toBeDefined();
    // Baseline for the same domain with the field answered instead of excluded.
    const baseline = build(statusesWhere(() => 'satisfied')).domains.find((d) => d.domain === target.domain);
    expect(owner!.notApplicableCount).toBe((baseline?.notApplicableCount ?? 0) + 1);
  });

  it('never lets a not-applicable field lower the domain percentage', () => {
    // The whole point of N/A: excluding a field must leave the score alone, not dent it.
    const target = scoredSet([])[0];
    const answered = build(statusesWhere(() => 'satisfied'));
    const excluded = build(statusesWhere((id) => (id === target.field_id ? 'not_applicable' : 'satisfied')));
    for (const d of excluded.domains) {
      const before = answered.domains.find((x) => x.domain === d.domain);
      expect(d.pct, d.domain).toBeGreaterThanOrEqual(before?.pct ?? 0);
    }
  });

  it('asserting a predicate moves its fields out of N/A and onto the map', () => {
    const withoutPool = build(statusesWhere(() => 'missing'), []);
    const withPool = build(statusesWhere(() => 'missing'), ['has_pool']);
    const gated = REGISTRY_FIELDS.filter(
      (f) => f.applicability === 'has_pool' && f.gap_weight > 0 && !f.system_section,
    );
    expect(gated.length).toBeGreaterThan(0);
    const plotted = (v: ReturnType<typeof build>) => v.domains.flatMap((d) => d.fields.map((f) => f.fieldId));
    for (const f of gated) {
      expect(plotted(withoutPool)).not.toContain(f.field_id);
      expect(plotted(withPool)).toContain(f.field_id);
    }
    expect(withPool.notApplicableCount).toBe(withoutPool.notApplicableCount - gated.length);
  });

  it('leaves notApplicableDomains empty while every domain still has a scored field', () => {
    // No registry domain is fully predicate-gated today. This asserts that invariant so
    // the list only ever appears when a domain genuinely drops out entirely.
    const view = build(statusesWhere(() => 'missing'));
    expect(view.notApplicableDomains).toEqual([]);
  });
});
