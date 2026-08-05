// Pure logic for the AI approval queue (backlog P2-06 / P2-08).
//
// Nothing in this file touches a database or a React tree, so the rules that
// decide "may this value be written to that field" are unit testable in
// isolation and have exactly one definition shared by the API route, the review
// UI, and the ingestion pipeline that creates the proposals.
//
// SECURITY POSTURE
// The database lets `field_path` be any dotted string, on purpose (see the
// migration header). This allowlist is the real gate: applyProposal refuses any
// path with no entry here, so a row written with a bogus or hostile path is
// inert. Adding a proposable field is an edit to PROPOSABLE_FIELDS, which is
// reviewable in a diff, rather than a migration nobody reads.

import type { Database } from '@/lib/database.types';
import { TONE_PRESET_IDS, type TonePresetId } from '@/lib/constants';

export type ProposedUpdateStatus = Database['public']['Enums']['proposed_update_status'];

export const PROPOSAL_STATUS_LABEL: Record<ProposedUpdateStatus, string> = {
  pending: 'Waiting for you',
  approved: 'Approved',
  modified: 'Approved with edits',
  denied: 'Declined',
};

export type ProposalSourceType =
  | 'listing_url'
  | 'document'
  | 'text_paste'
  | 'tone_migration'
  | 'nearby_refresh'
  | 'ai_suggestion';

export const PROPOSAL_SOURCE_LABEL: Record<ProposalSourceType, string> = {
  listing_url: 'Read from a listing page',
  document: 'Read from a document you uploaded',
  text_paste: 'Read from text you pasted',
  tone_migration: 'Existing tone setting needs confirming',
  nearby_refresh: 'Refreshed from the map',
  ai_suggestion: 'Suggested to fill a gap',
};

// ---------------------------------------------------------------------------
// Field allowlist
// ---------------------------------------------------------------------------

/**
 * `brain_item` fields become a new knowledge entry (title + body + category)
 * on approval. `text` fields overwrite a single scalar column. `tone_preset` is
 * a `text` field whose value must additionally be one of the five preset ids.
 */
export type ProposableKind = 'brain_item' | 'text' | 'tone_preset';

export interface ProposableField {
  path: string;
  /** Shown in the review list when the row's own label is missing. */
  label: string;
  kind: ProposableKind;
  /** Which table the approved value lands in. */
  target: 'brain_items' | 'properties' | 'property_settings';
  /** Column name for `properties` / `property_settings` targets. */
  column?: string;
  /** Character ceiling for `text` values. */
  maxLength?: number;
}

export const PROPOSABLE_FIELDS: Record<string, ProposableField> = {
  'brain.listing_summary': {
    path: 'brain.listing_summary',
    label: 'Property details read from a listing page',
    kind: 'brain_item',
    target: 'brain_items',
  },
  'brain.document_summary': {
    path: 'brain.document_summary',
    label: 'Property details read from a document',
    kind: 'brain_item',
    target: 'brain_items',
  },
  'properties.city': {
    path: 'properties.city', label: 'City', kind: 'text', target: 'properties', column: 'city', maxLength: 120,
  },
  'properties.region': {
    path: 'properties.region', label: 'State / region', kind: 'text', target: 'properties', column: 'region', maxLength: 120,
  },
  'properties.country': {
    path: 'properties.country', label: 'Country', kind: 'text', target: 'properties', column: 'country', maxLength: 120,
  },
  'properties.postal_code': {
    path: 'properties.postal_code', label: 'Postal code', kind: 'text', target: 'properties', column: 'postal_code', maxLength: 32,
  },
  'properties.address_line1': {
    path: 'properties.address_line1', label: 'Street address', kind: 'text', target: 'properties', column: 'address_line1', maxLength: 200,
  },
  'property_settings.concierge_tone': {
    path: 'property_settings.concierge_tone',
    label: 'Concierge tone',
    kind: 'tone_preset',
    target: 'property_settings',
    column: 'concierge_tone',
    maxLength: 40,
  },
};

export function proposableField(path: string): ProposableField | null {
  // Object.prototype keys ('constructor', '__proto__', …) would otherwise
  // resolve to inherited members and pass a truthy check.
  if (!Object.prototype.hasOwnProperty.call(PROPOSABLE_FIELDS, path)) return null;
  return PROPOSABLE_FIELDS[path];
}

export function isProposableField(path: string): boolean {
  return proposableField(path) !== null;
}

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

export interface BrainItemProposal {
  title: string;
  text: string;
  category: Database['public']['Enums']['brain_category'];
  visibility: Database['public']['Enums']['brain_visibility'];
  sourceUrl?: string | null;
}

export type NormalizeResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

type BrainCategoryValue = Database['public']['Enums']['brain_category'];

const BRAIN_CATEGORIES: readonly BrainCategoryValue[] = [
  'core', 'appliances', 'house_rules', 'checkin_checkout', 'local_recommendations',
  'emergency', 'documents', 'product_urls', 'host_qa', 'internal_notes', 'transportation',
];

function asBrainCategory(v: unknown): BrainCategoryValue {
  return typeof v === 'string' && (BRAIN_CATEGORIES as readonly string[]).includes(v)
    ? (v as BrainCategoryValue)
    : 'product_urls';
}

const MAX_BRAIN_TEXT = 20000;

/**
 * Validates and canonicalizes a value against its field's contract.
 *
 * Called on BOTH paths: when ingestion drafts a proposal, and again when a host
 * approves a hand-edited version. Validating on approval is the important one —
 * the edited value arrives from a browser and must not be trusted just because
 * the row it belongs to was created server-side.
 */
export function normalizeProposedValue(field: ProposableField, raw: unknown): NormalizeResult {
  if (field.kind === 'brain_item') {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, error: 'That entry is missing its content.' };
    }
    const v = raw as Record<string, unknown>;
    const title = typeof v.title === 'string' ? v.title.trim() : '';
    const text = typeof v.text === 'string' ? v.text.trim() : '';
    if (title.length === 0) return { ok: false, error: 'Give this entry a title.' };
    if (title.length > 200) return { ok: false, error: 'Titles are limited to 200 characters.' };
    if (text.length < 20) return { ok: false, error: 'There is not enough content here to save.' };
    if (text.length > MAX_BRAIN_TEXT) return { ok: false, error: 'That entry is too long to save.' };
    const category = asBrainCategory(v.category);
    const visibility = v.visibility === 'internal' ? 'internal' : 'guest';
    const sourceUrl = typeof v.sourceUrl === 'string' && v.sourceUrl.length <= 2000 ? v.sourceUrl : null;
    return {
      ok: true,
      value: { title, text, category, visibility, sourceUrl } satisfies BrainItemProposal,
    };
  }

  if (typeof raw !== 'string') return { ok: false, error: 'That value is not text.' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'That value cannot be empty.' };

  if (field.kind === 'tone_preset') {
    if (!(TONE_PRESET_IDS as readonly string[]).includes(trimmed)) {
      return { ok: false, error: 'Pick one of the available tones.' };
    }
    return { ok: true, value: trimmed as TonePresetId };
  }

  const max = field.maxLength ?? 500;
  if (trimmed.length > max) return { ok: false, error: `Keep this under ${max} characters.` };
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export type ProposalDecision = 'approve' | 'modify' | 'deny';

export const PROPOSAL_DECISIONS: readonly ProposalDecision[] = ['approve', 'modify', 'deny'];

export function isProposalDecision(v: unknown): v is ProposalDecision {
  return typeof v === 'string' && (PROPOSAL_DECISIONS as readonly string[]).includes(v);
}

export function statusForDecision(decision: ProposalDecision): ProposedUpdateStatus {
  return decision === 'approve' ? 'approved' : decision === 'modify' ? 'modified' : 'denied';
}

/**
 * Only pending rows are decidable.
 *
 * Re-deciding a settled row is refused rather than silently re-applied: an
 * approved brain entry has already been chunked and embedded, so "approve"
 * twice would duplicate it in retrieval, and "deny" after "approve" would leave
 * the guest-visible copy in place while the queue claimed it was rejected.
 */
export function canDecide(status: ProposedUpdateStatus): boolean {
  return status === 'pending';
}

// ---------------------------------------------------------------------------
// Queue summary (the dashboard tile — P2-08)
// ---------------------------------------------------------------------------

export interface QueueRow {
  status: ProposedUpdateStatus;
  created_at: string;
}

export interface QueueSummary {
  pending: number;
  /** Whole days since the oldest pending row was created; null when none. */
  oldestPendingDays: number | null;
  /** One-line tile subtitle. */
  detail: string;
}

export function daysBetween(fromIso: string, now: Date): number {
  const then = new Date(fromIso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

export function queueSummary(rows: QueueRow[], now: Date = new Date()): QueueSummary {
  const pendingRows = rows.filter((r) => r.status === 'pending');
  if (pendingRows.length === 0) {
    return { pending: 0, oldestPendingDays: null, detail: 'Nothing waiting. Anything the AI reads lands here first.' };
  }
  const oldest = pendingRows.reduce(
    (acc, r) => (new Date(r.created_at).getTime() < new Date(acc.created_at).getTime() ? r : acc),
    pendingRows[0],
  );
  const days = daysBetween(oldest.created_at, now);
  const age = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  const noun = pendingRows.length === 1 ? 'suggestion' : 'suggestions';
  return {
    pending: pendingRows.length,
    oldestPendingDays: days,
    detail: `${pendingRows.length} ${noun} to review. Oldest arrived ${age}.`,
  };
}

/** Short preview of a jsonb value for the review list. */
export function summarizeValue(value: unknown, max = 180): string {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'string') return truncate(value, max);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (typeof v.text === 'string') return truncate(v.text, max);
  }
  try {
    return truncate(JSON.stringify(value), max);
  } catch {
    return 'Not previewable';
  }
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}\u2026`;
}
