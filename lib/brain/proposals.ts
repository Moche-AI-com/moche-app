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
import { REGISTRY_FIELDS, type RegistryField } from '@/lib/brain/completeness';
import { isBrainSection, storageCategoryFor } from '@/lib/brain/taxonomy';

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
  | 'ai_suggestion'
  | 'registry_migration';

export const PROPOSAL_SOURCE_LABEL: Record<ProposalSourceType, string> = {
  listing_url: 'Read from a listing page',
  document: 'Read from a document you uploaded',
  text_paste: 'Read from text you pasted',
  tone_migration: 'Existing tone setting needs confirming',
  nearby_refresh: 'Refreshed from the map',
  ai_suggestion: 'Suggested to fill a gap',
  registry_migration: 'Found in your existing notes',
};

// ---------------------------------------------------------------------------
// Field allowlist
// ---------------------------------------------------------------------------

/**
 * `brain_item` fields become a new knowledge entry (title + body + category)
 * on approval. `text` fields overwrite a single scalar column. `tone_preset` is
 * a `text` field whose value must additionally be one of the five preset ids.
 */
export type ProposableKind = 'brain_item' | 'text' | 'tone_preset' | 'brain_value';

/**
 * Prefix for registry-backed paths: `brain_value.<field_id>`.
 *
 * These are NOT hand-listed in PROPOSABLE_FIELDS. field_registry.json is
 * generated and is already the allowlist the database trigger enforces, so
 * hand-copying 53 entries here would create a second list to drift out of sync
 * with the first. Resolution goes through the registry, which means an unknown
 * field_id fails the same way an unknown path does.
 */
export const BRAIN_VALUE_PREFIX = 'brain_value.';

/**
 * Secrets are deliberately not proposable. A proposal row holds its value as
 * plaintext jsonb in `proposed_updates`, so routing a Wi-Fi password or door
 * code through this queue would reintroduce exactly the plaintext-at-rest
 * exposure the brain_values envelope exists to prevent. Secrets are entered by
 * the host directly and go straight to Vault.
 */
export function isRegistryProposable(f: RegistryField): boolean {
  return !f.system_section && f.type !== 'secret';
}

const REGISTRY_BY_ID: ReadonlyMap<string, RegistryField> = new Map(
  REGISTRY_FIELDS.filter(isRegistryProposable).map((f) => [f.field_id, f]),
);

export function registryProposableField(fieldId: string): ProposableField | null {
  const reg = REGISTRY_BY_ID.get(fieldId);
  if (!reg) return null;
  return {
    path: `${BRAIN_VALUE_PREFIX}${fieldId}`,
    label: reg.label,
    kind: 'brain_value',
    target: 'brain_values',
    fieldId,
    valueType: reg.type,
    maxLength: reg.type === 'text' ? 2000 : 200,
  };
}

export interface ProposableField {
  path: string;
  /** Shown in the review list when the row's own label is missing. */
  label: string;
  kind: ProposableKind;
  /** Which table the approved value lands in. */
  target: 'brain_items' | 'properties' | 'property_settings' | 'brain_values';
  /** Column name for `properties` / `property_settings` targets. */
  column?: string;
  /** Registry field_id for `brain_values` targets. */
  fieldId?: string;
  /** Registry value type for `brain_values` targets. */
  valueType?: string;
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
  if (path.startsWith(BRAIN_VALUE_PREFIX)) {
    return registryProposableField(path.slice(BRAIN_VALUE_PREFIX.length));
  }
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
  /**
   * Canonical section (registry domain id) this entry files under. Validated
   * against the taxonomy at BOTH boundaries (draft + approval) — a misroute
   * fails the review loudly instead of silently filing into the wrong bucket.
   */
  section?: string | null;
  /** Custom feature target (Spaces & features). Ownership is verified at apply time. */
  featureId?: string | null;
  /**
   * Set when this proposal REPLACES an existing brain item rather than adding a
   * new one — the add/replace decision is made when the update is drafted (by the
   * brain_ops-tier routing call) and carried here so approval is a deterministic
   * apply, never a second judgement.
   */
  replacesItemId?: string | null;
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

// Feature and replacement targets are uuid references carried through a jsonb
// value — shape-check them here; ownership is verified at apply time.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // Routing fields (2026-08-28 directive). An update lands in a precise place —
    // a canonical section, optionally a custom feature, and either as a new entry
    // or an in-place replacement of an existing one. Each is validated here so a
    // bad route is a review error the host can see, not a silent misfile.
    let section: string | null = null;
    if (typeof v.section === 'string' && v.section.trim()) {
      const s = v.section.trim();
      if (!isBrainSection(s)) return { ok: false, error: 'That section is not one this Brain has.' };
      section = s;
    }
    let featureId: string | null = null;
    if (typeof v.featureId === 'string' && v.featureId.trim()) {
      const f = v.featureId.trim();
      if (!UUID_RE.test(f)) return { ok: false, error: 'That feature target is not valid.' };
      featureId = f;
      // A feature target implies its coarse section, so retrieval and display agree.
      section = 'amenities';
    }
    let replacesItemId: string | null = null;
    if (typeof v.replacesItemId === 'string' && v.replacesItemId.trim()) {
      const r = v.replacesItemId.trim();
      if (!UUID_RE.test(r)) return { ok: false, error: 'That replacement target is not valid.' };
      replacesItemId = r;
    }

    // The storage bucket follows the routing decision, not the model's free choice:
    // a precise section implies its bucket, so the two can never disagree.
    const category = section ? storageCategoryFor(section) : asBrainCategory(v.category);
    const visibility = v.visibility === 'internal' ? 'internal' : 'guest';
    const sourceUrl = typeof v.sourceUrl === 'string' && v.sourceUrl.length <= 2000 ? v.sourceUrl : null;
    return {
      ok: true,
      value: { title, text, category, visibility, sourceUrl, section, featureId, replacesItemId } satisfies BrainItemProposal,
    };
  }

  if (typeof raw !== 'string') return { ok: false, error: 'That value is not text.' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'That value cannot be empty.' };

  if (field.kind === 'brain_value') {
    return normalizeRegistryValue(field, trimmed);
  }

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

const TIME_24H = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Type validation for registry-backed values. The database trigger enforces
 * tier, audience and payload shape but has no opinion on whether a `time` field
 * holds "11:00" or "whenever" — that check belongs here, where the host still
 * gets a sentence they can act on.
 */
function normalizeRegistryValue(field: ProposableField, trimmed: string): NormalizeResult {
  const max = field.maxLength ?? 500;
  if (trimmed.length > max) return { ok: false, error: `Keep this under ${max} characters.` };

  switch (field.valueType) {
    case 'time':
      if (!TIME_24H.test(trimmed)) {
        return { ok: false, error: 'Use a 24-hour time like 11:00.' };
      }
      return { ok: true, value: trimmed };
    case 'date':
      if (!ISO_DATE.test(trimmed)) {
        return { ok: false, error: 'Use a date like 2026-08-12.' };
      }
      return { ok: true, value: trimmed };
    case 'number': {
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return { ok: false, error: 'That needs to be a number.' };
      return { ok: true, value: n };
    }
    default:
      // text / string / enum / place / contact all land as trimmed text. The
      // three enum fields carry no value list in the registry, so constraining
      // them here would be inventing a contract the generator never declared.
      return { ok: true, value: trimmed };
  }
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
    return { pending: 0, oldestPendingDays: null, detail: 'Nothing waiting. Anything the AI learns after setup lands here first.' };
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
    detail: `${pendingRows.length} ${noun} to approve. Oldest arrived ${age}.`,
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
