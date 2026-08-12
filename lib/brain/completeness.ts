// Onboarding completeness has one canonical calculation, defined by
// docs/DIRECTIVE-AMENDMENT-001.md Section A. No surface may compute a
// percentage independently, including the import/bootstrap copy: the "30-50%
// bootstrap" and the 65% ship threshold are the same scale, or a host reading
// both numbers gets two different answers about the same property.
//
// This sits alongside computeReadiness() in ./readiness rather than replacing
// it. readiness scores the 8 legacy host-facing categories; completeness scores
// the registry, and is the number the ship gate reads.

import registry from '../../field_registry.json';

export type FieldStatus = 'missing' | 'partial' | 'satisfied' | 'not_applicable';

/** Amendment 001-A.4. Necessary but not sufficient: the hard blocks clear separately. */
export const COMPLETENESS_SHIP_THRESHOLD = registry.completeness.ship_threshold_pct;

/** Amendment 001-A.3. `not_applicable` is absent by design: it leaves the denominator. */
const CREDIT: Record<Exclude<FieldStatus, 'not_applicable'>, number> = {
  satisfied: 1,
  partial: 0.5,
  missing: 0,
};

export interface RegistryField {
  field_id: string;
  label: string;
  domain: string;
  system_section: boolean;
  sensitivity_tier: string;
  default_audience: string;
  gap_weight: number;
  hard_block: boolean;
  applicability: string;
  requires_on_failure: boolean;
  on_failure_field: string | null;
  interview_prompt: string;
}

export const REGISTRY_FIELDS = registry.fields as unknown as RegistryField[];

export const HARD_BLOCK_FIELD_IDS: readonly string[] = REGISTRY_FIELDS
  .filter((f) => f.hard_block)
  .map((f) => f.field_id);

export interface CompletenessInput {
  /** Status per field_id. An absent field_id is treated as `missing`. */
  statuses?: Readonly<Record<string, FieldStatus>>;
  /**
   * Applicability predicates that resolve true for this property. A registry
   * field whose predicate is absent here is removed from the denominator
   * entirely rather than credited (Amendment 001-A.2). `always` is implicit.
   */
  applicable?: readonly string[];
}

export interface CompletenessGap {
  fieldId: string;
  label: string;
  domain: string;
  status: FieldStatus;
  gapWeight: number;
  hardBlock: boolean;
  /** The question to ask the host. Registry text only, never model-authored. */
  interviewPrompt: string;
}

export interface CompletenessDomain {
  domain: string;
  weight: number;
  earned: number;
  pct: number;
  gaps: CompletenessGap[];
}

export interface Completeness {
  /** 0-100, two decimals. The only completeness number any surface may render. */
  pct: number;
  /** Sum of gap_weight over the scored set. Exposed so the figure is auditable. */
  denominator: number;
  numerator: number;
  domains: CompletenessDomain[];
  gaps: CompletenessGap[];
  /** Hard-block fields not yet `satisfied`. Publication is blocked while non-empty. */
  hardBlocksOutstanding: CompletenessGap[];
  /** True only when the threshold is met AND every hard block is satisfied. */
  canPublish: boolean;
  blockedReason: 'below_threshold' | 'hard_blocks_outstanding' | 'both' | null;
}

function isApplicable(field: RegistryField, applicable: ReadonlySet<string>): boolean {
  return field.applicability === 'always' || applicable.has(field.applicability);
}

/**
 * The scored set (Amendment 001-A.2): gap_weight > 0, not a hidden system
 * section, and applicable to this property.
 */
export function scoredSet(applicable: readonly string[] = []): RegistryField[] {
  const set = new Set(applicable);
  return REGISTRY_FIELDS.filter(
    (f) => f.gap_weight > 0 && !f.system_section && isApplicable(f, set),
  );
}

export function computeCompleteness(input: CompletenessInput = {}): Completeness {
  const statuses = input.statuses ?? {};
  const fields = scoredSet(input.applicable ?? []);

  const byDomain = new Map<string, { weight: number; earned: number; gaps: CompletenessGap[] }>();
  let numerator = 0;
  let denominator = 0;
  const gaps: CompletenessGap[] = [];

  for (const field of fields) {
    const status = statuses[field.field_id] ?? 'missing';

    // Amendment 001-A.2: not_applicable leaves the denominator; it is never
    // credited as satisfied. Crediting it inflates the score, which is the
    // specific bug this branch exists to prevent.
    if (status === 'not_applicable') continue;

    const bucket = byDomain.get(field.domain) ?? { weight: 0, earned: 0, gaps: [] };
    const earned = CREDIT[status] * field.gap_weight;

    denominator += field.gap_weight;
    numerator += earned;
    bucket.weight += field.gap_weight;
    bucket.earned += earned;

    if (status !== 'satisfied') {
      const gap: CompletenessGap = {
        fieldId: field.field_id,
        label: field.label,
        domain: field.domain,
        status,
        gapWeight: field.gap_weight,
        hardBlock: field.hard_block,
        interviewPrompt: field.interview_prompt,
      };
      bucket.gaps.push(gap);
      gaps.push(gap);
    }

    byDomain.set(field.domain, bucket);
  }

  const pct = denominator === 0 ? 0 : round2((numerator / denominator) * 100);

  const domains: CompletenessDomain[] = [...byDomain.entries()]
    .map(([domain, b]) => ({
      domain,
      weight: round2(b.weight),
      earned: round2(b.earned),
      pct: b.weight === 0 ? 0 : round2((b.earned / b.weight) * 100),
      // Heaviest gaps first: this ordering drives the host's next question.
      gaps: b.gaps.slice().sort((a, z) => z.gapWeight - a.gapWeight),
    }))
    .sort((a, z) => z.weight - a.weight);

  const hardBlocksOutstanding = gaps.filter((g) => g.hardBlock);
  const belowThreshold = pct < COMPLETENESS_SHIP_THRESHOLD;
  const blocked = hardBlocksOutstanding.length > 0;

  return {
    pct,
    denominator: round2(denominator),
    numerator: round2(numerator),
    domains,
    gaps: gaps.slice().sort((a, z) => z.gapWeight - a.gapWeight),
    hardBlocksOutstanding,
    canPublish: !belowThreshold && !blocked,
    blockedReason:
      belowThreshold && blocked
        ? 'both'
        : belowThreshold
          ? 'below_threshold'
          : blocked
            ? 'hard_blocks_outstanding'
            : null,
  };
}

/**
 * Amendment 001-A.5. Import output must be described on the same scale as the
 * ship threshold, so a host reads one continuous number. Callers must pass the
 * result of computeCompleteness() rather than counting extracted fields.
 */
export function describeBootstrap(result: Completeness): string {
  const remaining = COMPLETENESS_SHIP_THRESHOLD - result.pct;
  if (remaining <= 0) {
    return `Import got you to ${result.pct}%, past the ${COMPLETENESS_SHIP_THRESHOLD}% you need to share.`;
  }
  return `Import got you to ${result.pct}%. You need ${COMPLETENESS_SHIP_THRESHOLD}% to share, so about ${round2(remaining)}% to go.`;
}

/**
 * Amendment 001-A.3: a field with a value but an empty required fallback is
 * `partial`, never `satisfied`. An access or operational field with no fallback
 * procedure is deliberately never fully credited (Section 3 on_failure_field).
 */
export function deriveStatus(
  field: RegistryField,
  hasValue: boolean,
  fallbackHasValue: boolean,
): FieldStatus {
  if (!hasValue) return 'missing';
  if (field.requires_on_failure && !fallbackHasValue) return 'partial';
  return 'satisfied';
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
