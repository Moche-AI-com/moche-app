// Coverage Map view model (§7.5). Read-only, and last in the sequence by design: the
// cards and the three action queues are the working surfaces, and a graph that competes
// with them for attention makes coverage feel explored rather than closed.
//
// The layout is computed here, not in the client component, for one reason: it must be
// deterministic and testable. A force simulation looks organic and makes "did this field
// move domains?" unanswerable in a test.

import {
  REGISTRY_FIELDS,
  domainLabel,
  scoredSet,
  type CompletenessDomain,
  type FieldStatus,
} from './completeness';

export type CoverageState = 'satisfied' | 'partial' | 'missing' | 'blocking';

export interface CoverageFieldNode {
  fieldId: string;
  label: string;
  domain: string;
  state: CoverageState;
  hardBlock: boolean;
  /** Unit-circle position within the domain cluster, -1..1. */
  x: number;
  y: number;
}

export interface CoverageDomainNode {
  domain: string;
  label: string;
  pct: number;
  weight: number;
  fieldCount: number;
  gapCount: number;
  /** Unit-circle position of the hub, -1..1. */
  x: number;
  y: number;
  fields: CoverageFieldNode[];
}

export interface CoverageMapView {
  domains: CoverageDomainNode[];
  totals: Record<CoverageState, number>;
  /** Fields excluded because the host declared the feature absent. Shown as a count only. */
  notApplicableCount: number;
}

/**
 * A missing hard-block field is `blocking`, not `missing`. The distinction is the whole
 * point of the map: two red dots that both read "missing" hide the fact that one of them
 * is the reason the property cannot publish.
 */
function stateFor(status: FieldStatus, hardBlock: boolean): CoverageState {
  if (status === 'satisfied') return 'satisfied';
  if (status === 'partial') return 'partial';
  return hardBlock ? 'blocking' : 'missing';
}

export function buildCoverageMap(input: {
  statuses: Readonly<Record<string, FieldStatus>>;
  applicable: readonly string[];
  domains: readonly CompletenessDomain[];
}): CoverageMapView {
  const fields = scoredSet(input.applicable);
  const byDomain = new Map<string, CoverageFieldNode[]>();
  const totals: Record<CoverageState, number> = { satisfied: 0, partial: 0, missing: 0, blocking: 0 };

  for (const field of fields) {
    const status = input.statuses[field.field_id] ?? 'missing';
    // not_applicable fields are outside the scored set already for predicate-gated
    // fields; this catches the per-property declaration on an always-scored field.
    if (status === 'not_applicable') continue;
    const state = stateFor(status, field.hard_block);
    totals[state] += 1;
    const arr = byDomain.get(field.domain) ?? [];
    arr.push({
      fieldId: field.field_id,
      label: field.label,
      domain: field.domain,
      state,
      hardBlock: field.hard_block,
      x: 0,
      y: 0,
    });
    byDomain.set(field.domain, arr);
  }

  // Domain order follows the registry, not the score, so the map does not reshuffle
  // between visits as a host fills fields in.
  const domainOrder: string[] = [];
  for (const f of REGISTRY_FIELDS) {
    if (byDomain.has(f.domain) && !domainOrder.includes(f.domain)) domainOrder.push(f.domain);
  }

  const domainMeta = new Map(input.domains.map((d) => [d.domain, d]));

  const domains: CoverageDomainNode[] = domainOrder.map((domain, i) => {
    const angle = (i / domainOrder.length) * Math.PI * 2 - Math.PI / 2;
    const hubX = Math.cos(angle);
    const hubY = Math.sin(angle);
    const nodes = (byDomain.get(domain) ?? []).map((node, j, all) => {
      const a = (j / all.length) * Math.PI * 2 - Math.PI / 2;
      return { ...node, x: Math.cos(a), y: Math.sin(a) };
    });
    const meta = domainMeta.get(domain);
    return {
      domain,
      label: domainLabel(domain),
      pct: meta?.pct ?? 0,
      weight: meta?.weight ?? 0,
      fieldCount: nodes.length,
      gapCount: nodes.filter((n) => n.state !== 'satisfied').length,
      x: hubX,
      y: hubY,
      fields: nodes,
    };
  });

  const notApplicableCount =
    REGISTRY_FIELDS.filter((f) => f.gap_weight > 0 && !f.system_section).length - fields.length +
    Object.values(input.statuses).filter((s) => s === 'not_applicable').length;

  return { domains, totals, notApplicableCount: Math.max(0, notApplicableCount) };
}
