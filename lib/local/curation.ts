// ---------------------------------------------------------------------------
// WS-6 — Local Recs curation state machine.
//
// The `recommendations` table has no `curation_status` column — it encodes
// state across three existing columns (`approved`, `hidden`, `host_preference`)
// that predate WS-6. Rather than add a fourth redundant status column (which
// could drift out of sync with the columns that actually drive queries and
// RLS), WS-6 derives the four spec'd states from those columns with the pure
// function below. This is the SINGLE authoritative mapping — the dashboard
// UI, the coverage indicator, and the retrieval-projection comments in
// `app/dashboard/properties/[id]/recommendations/actions.ts` must all agree
// with this function, not reimplement the logic themselves.
//
//   unreviewed — !approved && !hidden   (staged by auto-discovery, host has
//                                         not acted on it yet)
//   rejected   — hidden === true         (hard-excluded from the guest-facing
//                                         projection regardless of `approved`
//                                         or `host_preference` — see
//                                         projectRecommendationsToBrain)
//   favorite   — approved && !hidden && host_preference === 'loved'
//                                        (retrieval-boosted: sorted first and
//                                         annotated "Host favorite" in the
//                                         projected Brain text)
//   approved   — approved && !hidden && host_preference !== 'loved'
//                                        (everything else host has accepted:
//                                         neutral AND disliked-but-not-hidden.
//                                         `disliked` alone does not exclude —
//                                         a host must explicitly hide/reject
//                                         a place to remove it from guest view)
// ---------------------------------------------------------------------------

export type CurationStatus = 'unreviewed' | 'approved' | 'favorite' | 'rejected';

export interface CurationInput {
  approved: boolean;
  hidden: boolean;
  host_preference: 'loved' | 'neutral' | 'disliked' | null;
}

export function deriveCurationStatus(rec: CurationInput): CurationStatus {
  if (rec.hidden) return 'rejected';
  if (!rec.approved) return 'unreviewed';
  return rec.host_preference === 'loved' ? 'favorite' : 'approved';
}

// The FormData patch a UI action needs to send to actions.ts's
// updateRecommendationAction to MOVE a row into a given target status.
// Centralized here so the manager UI and any bulk-action path build the same
// patch shape for the same target state.
export function statusTransitionPatch(
  target: CurationStatus,
): { approved: boolean; hidden: boolean; host_preference: 'loved' | 'neutral' | 'disliked' } {
  switch (target) {
    case 'unreviewed':
      return { approved: false, hidden: false, host_preference: 'neutral' };
    case 'approved':
      return { approved: true, hidden: false, host_preference: 'neutral' };
    case 'favorite':
      return { approved: true, hidden: false, host_preference: 'loved' };
    case 'rejected':
      return { approved: true, hidden: true, host_preference: 'neutral' };
  }
}

export interface CoverageInput {
  category: string | null;
}

export interface CategoryCoverage {
  category: string;
  approvedCount: number;
}

/**
 * WS-6 coverage/quality indicator: how many of the canonical categories have
 * at least one approved (approved or favorite — i.e. not unreviewed/rejected)
 * pick. Callers pass only the LIVE set (status !== 'unreviewed' && !== 'rejected')
 * so this function stays a plain tally with no status logic of its own.
 */
export function computeCategoryCoverage(
  liveRecs: CoverageInput[],
  categories: readonly string[],
): { covered: number; total: number; byCategory: CategoryCoverage[] } {
  const byCategory: CategoryCoverage[] = categories.map((category) => ({
    category,
    approvedCount: liveRecs.filter((r) => r.category === category).length,
  }));
  const covered = byCategory.filter((c) => c.approvedCount > 0).length;
  return { covered, total: categories.length, byCategory };
}
