import { queueSummary } from '@/lib/brain/proposals';

/**
 * Returns a requested property scope only when it is part of the caller's
 * already-authorized property list. Call this after the server-side property
 * query so an arbitrary URL parameter can never widen the dashboard scope.
 */
export function resolveScope(requestedId: string | null | undefined, allowedIds: string[]): string | null {
  return requestedId && allowedIds.includes(requestedId) ? requestedId : null;
}

export interface KnowledgeReviewRow {
  property_id: string;
  created_at: string;
}

export interface KnowledgeReviewSummary {
  pending: number;
  affectedProperties: number;
  oldestLabel: string | null;
  detail: string;
}

/**
 * Summarizes already-scoped pending proposals for the dashboard card. The
 * wording for the queue detail intentionally remains in queueSummary(), which
 * is also used by the full Knowledge Queue.
 */
export function knowledgeReviewSummary(rows: KnowledgeReviewRow[], now: Date = new Date()): KnowledgeReviewSummary {
  const queue = queueSummary(
    rows.map((row) => ({ status: 'pending' as const, created_at: row.created_at })),
    now,
  );
  const days = queue.oldestPendingDays;
  const oldestLabel = days === null ? null : days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;

  return {
    pending: queue.pending,
    affectedProperties: new Set(rows.map((row) => row.property_id)).size,
    oldestLabel,
    detail: queue.detail,
  };
}

export interface ExtrasStatusRow {
  status: string;
}

export interface ExtrasRequestSummary {
  total: number;
  needsResponse: number;
  resolved: number;
}

/**
 * Escalation-backed Extras requests record only a lifecycle status. Open rows
 * need a response; closed and resolved rows are shown as resolved rather than
 * being guessed as payments or scheduled work.
 */
export function extrasRequestSummary(rows: ExtrasStatusRow[]): ExtrasRequestSummary {
  return rows.reduce<ExtrasRequestSummary>(
    (summary, row) => {
      summary.total += 1;
      if (row.status === 'open') summary.needsResponse += 1;
      if (row.status === 'closed' || row.status === 'resolved') summary.resolved += 1;
      return summary;
    },
    { total: 0, needsResponse: 0, resolved: 0 },
  );
}
