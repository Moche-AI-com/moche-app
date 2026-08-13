// Coverage Map view model. Read-only and hover-only: it is the orientation surface at
// the top of the Brain page, so it must answer "where are my gaps?" without becoming a
// second editing entry point with none of the editor's guardrails.
//
// The layout is computed here, not in the client component, for one reason: it must be
// deterministic and testable. A force simulation looks organic and makes "did this field
// move domains?" unanswerable in a test.
//
// Not-applicable fields are deliberately absent from `fields` — a grey dot that means
// "you told us there is no pool" reads as a gap no matter how it is coloured. They are
// reported as counts instead (per domain and overall) so the host can see that declaring
// a feature absent removed work rather than hid it.

import {
  REGISTRY_FIELDS,
  domainLabel,
  scoredSet,
  type CompletenessDomain,
  type FieldStatus,
  type RegistryField,
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
  /**
   * Fields in this domain the host has taken out of scope. Counted, never plotted, and
   * never subtracted from `pct` — the score already omits them from its denominator.
   */
  notApplicableCount: number;
  /** Unit-circle position of the hub, -1..1. */
  x: number;
  y: number;
  fields: CoverageFieldNode[];
}

/**
 * A domain whose every field is out of scope. It has no hub on the map (there is nothing
 * to plot) but the host still needs to see it marked N/A rather than silently missing,
 * or "where did Parking go?" becomes a support question.
 */
export interface CoverageNotApplicableDomain {
  domain: string;
  label: string;
  count: number;
}

export interface CoverageMapView {
  domains: CoverageDomainNode[];
  totals: Record<CoverageState, number>;
  /** Fields excluded because the host declared the feature absent. Shown as a count only. */
  notApplicableCount: number;
  /** Domains that are entirely out of scope, so the UI can render an explicit "N/A". */
  notApplicableDomains: CoverageNotApplicableDomain[];
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

/**
 * The universe the score could ever draw from, before this property's applicability
 * answers narrow it. `scoredSet` minus this is what the host declared absent.
 */
function scorableFields(): RegistryField[] {
  return REGISTRY_FIELDS.filter((f) => f.gap_weight > 0 && !f.system_section);
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

  // Per-domain N/A, counted from the registry rather than inferred by subtraction so a
  // section can render "N/A" against the specific fields it lost. Two ways a field lands
  // here: its predicate was never asserted (out of the scored set), or it is in the
  // scored set but the host marked that one field not_applicable.
  const scoredIds = new Set(fields.map((f) => f.field_id));
  const naByDomain = new Map<string, number>();
  for (const f of scorableFields()) {
    const na = !scoredIds.has(f.field_id) || input.statuses[f.field_id] === 'not_applicable';
    if (!na) continue;
    naByDomain.set(f.domain, (naByDomain.get(f.domain) ?? 0) + 1);
  }

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
      notApplicableCount: naByDomain.get(domain) ?? 0,
      x: hubX,
      y: hubY,
      fields: nodes,
    };
  });

  const plotted = new Set(domainOrder);
  const notApplicableDomains: CoverageNotApplicableDomain[] = [];
  // Registry order again, for the same reason the hubs use it: a list that reshuffles
  // between visits makes the host re-read it every time.
  for (const f of scorableFields()) {
    if (plotted.has(f.domain)) continue;
    if (notApplicableDomains.some((d) => d.domain === f.domain)) continue;
    const count = naByDomain.get(f.domain) ?? 0;
    if (count === 0) continue;
    notApplicableDomains.push({ domain: f.domain, label: domainLabel(f.domain), count });
  }

  let notApplicableCount = 0;
  for (const n of naByDomain.values()) notApplicableCount += n;

  return { domains, totals, notApplicableCount, notApplicableDomains };
}
