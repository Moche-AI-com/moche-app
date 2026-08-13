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
});
