/**
 * One definition of the AI Updates surface: its name, its routes, and how a
 * count resolves to a destination.
 *
 * Naming (§3). The queue was shipped as "Updates" in the route and "Knowledge
 * Queue" in the UI — two names for one concept, which is worse than either. The
 * directive settles it: the surface is called **AI Updates**, everywhere. The
 * original reason for avoiding "Reviews" still holds and is why the word does
 * not appear here: to a short-term-rental host a "review" is what a guest writes
 * after checkout. "AI Updates" says both what produced the item (the assistant)
 * and what it is (a change waiting on you).
 *
 * Routing. AI Updates is a per-property tab, because a decision about one
 * property's door code is only ever made in that property's context, and the
 * host is already there when managing its Brain. The account-wide roll-up at
 * /dashboard/updates survives as an index only — it counts and links, it never
 * decides. That keeps every existing bookmark, notification deep-link, and
 * dashboard tile working while removing the global *manager* the directive's
 * §9 non-goals rule out.
 *
 * This module is pure so both the server pages and the tests can share it.
 */

/** User-visible name of the surface. Do not spell it inline anywhere else. */
export const AI_UPDATES_LABEL = 'AI Updates';

/** One-line explanation, reused by the tab, the roll-up, and the dashboard tile. */
export const AI_UPDATES_BLURB = 'Changes the assistant drafted for this Brain, waiting on your approval.';

/** Account-wide index. Kept for existing links; it is not a decision surface. */
export const AI_UPDATES_ROLLUP_PATH = '/dashboard/updates';

export type AiUpdatesView = 'pending' | 'reviewed';

/** Narrows an untrusted query param to a view. Anything unknown means pending. */
export function resolveAiUpdatesView(raw: string | string[] | null | undefined): AiUpdatesView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'reviewed' ? 'reviewed' : 'pending';
}

/** The per-property AI Updates tab. */
export function propertyAiUpdatesHref(propertyId: string, view?: AiUpdatesView): string {
  const base = `/dashboard/properties/${propertyId}/updates`;
  return view === 'reviewed' ? `${base}?view=reviewed` : base;
}

/** The account-wide roll-up. */
export function aiUpdatesRollupHref(): string {
  return AI_UPDATES_ROLLUP_PATH;
}

export interface AiUpdatesCount {
  propertyId: string;
  pending: number;
}

/**
 * Where a "go review these" control should point.
 *
 * An explicit scope wins. Otherwise a single affected property deep-links to its
 * tab, so the host is one click from the decision; several affected properties
 * fall back to the roll-up rather than guessing which one was meant.
 */
export function primaryAiUpdatesHref(rows: AiUpdatesCount[], scopedPropertyId?: string | null): string {
  if (scopedPropertyId) return propertyAiUpdatesHref(scopedPropertyId);
  const affected = rows.filter((row) => row.pending > 0);
  if (affected.length === 1) return propertyAiUpdatesHref(affected[0].propertyId);
  return aiUpdatesRollupHref();
}

/**
 * Columns the queue renders. Shared so the per-property tab and any future
 * caller cannot drift into selecting a different shape than ProposalRow types.
 */
export const AI_UPDATES_SELECT =
  'id, property_id, field_path, label, status, proposed_value, original_value, applied_value, source_type, source_ref, confidence, resolution_note, reviewed_at, created_at';

/** Rows fetched per view. A cap, not a page: the queue is meant to be drained. */
export const AI_UPDATES_ROW_LIMIT = 200;
