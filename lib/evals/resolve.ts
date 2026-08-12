// Deterministic direct-fact resolution — the decision the golden eval suite grades.
//
// Why grade this and not generated prose: a prose grader needs either a human or a judge
// model, so it cannot run in CI on every commit, and its verdicts are not reproducible.
// The autonomy gate (§7.0) needs a suite that is *deterministic*, so it grades the layer
// that actually decides whether a guest gets an answer at all: does a valid, in-window,
// audience-permitted fact exist for this question, or is this a knowledge gap? Generation
// quality is a separate, judge-based evaluation and is not this suite's job.
//
// §6: if a required fact is empty or unavailable, return needs_host and emit a
// knowledge_gap event — never query retrieval or generation to guess it.

import {
  audiencePermits,
  requiresAccessWindow,
  type AudienceTier,
  type SensitivityTier,
} from '@/lib/brain/audience';

export type ResolveStatus =
  /** A valid fact exists and this audience may see it. */
  | 'answered'
  /** No usable fact: absent, empty, or expired. Emits a knowledge gap. */
  | 'needs_host'
  /** The fact exists but this audience may not see it, or the access window is closed. */
  | 'refused'
  /** The fact does not apply to this property, so it is not a gap to chase. */
  | 'not_applicable';

export interface FactSnapshot {
  fieldId: string;
  sensitivityTier: SensitivityTier;
  /** Null/empty/whitespace all count as absent. A blank string is not an answer. */
  value: string | null;
  /** ISO timestamp. Past means the fact is stale and must be re-verified, not served. */
  ttlExpiresAt?: string | null;
}

export interface ResolveInput {
  fieldId: string;
  audience: AudienceTier;
  /** Facts known for this property, keyed by field_id. */
  facts: Readonly<Record<string, FactSnapshot>>;
  /** Field ids the property has declared inapplicable (no pool, no laundry, ...). */
  inapplicableFieldIds?: readonly string[];
  /** Whether the requester currently holds a live stay access window. */
  accessWindowOk?: boolean;
  now?: Date;
}

export interface ResolveResult {
  status: ResolveStatus;
  /** Machine reason for the audit record. Null when answered. */
  reason:
    | null
    | 'not_applicable'
    | 'absent'
    | 'empty'
    | 'expired'
    | 'audience_denied'
    | 'access_window_closed';
  /** True when a knowledge_gap_detected event should be emitted (§6). */
  knowledgeGap: boolean;
}

export function resolveFact(input: ResolveInput): ResolveResult {
  const now = input.now ?? new Date();

  if (input.inapplicableFieldIds?.includes(input.fieldId)) {
    // Not a gap: nothing is missing, the thing does not exist at this property.
    return { status: 'not_applicable', reason: 'not_applicable', knowledgeGap: false };
  }

  const fact = input.facts[input.fieldId];
  if (!fact) return { status: 'needs_host', reason: 'absent', knowledgeGap: true };
  if (fact.value === null || fact.value.trim() === '') {
    return { status: 'needs_host', reason: 'empty', knowledgeGap: true };
  }
  if (fact.ttlExpiresAt && Date.parse(fact.ttlExpiresAt) <= now.getTime()) {
    // Stale is a gap, not a refusal: the host needs to re-verify it.
    return { status: 'needs_host', reason: 'expired', knowledgeGap: true };
  }

  // Authorization is checked after existence so a denied audience cannot infer presence
  // from a different reason code — both audience_denied and access_window_closed are
  // returned as the same guest-visible `refused` status.
  if (!audiencePermits(fact.sensitivityTier, input.audience)) {
    return { status: 'refused', reason: 'audience_denied', knowledgeGap: false };
  }
  if (requiresAccessWindow(fact.sensitivityTier) && input.accessWindowOk !== true) {
    return { status: 'refused', reason: 'access_window_closed', knowledgeGap: false };
  }

  return { status: 'answered', reason: null, knowledgeGap: false };
}
