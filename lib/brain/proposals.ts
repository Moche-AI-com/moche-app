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
import { redactCredentials } from '@/lib/brain/redact';
import { safeWifiInstructions, safeWifiLocation } from '@/lib/guest/wifi-instructions';

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

export type ProposableKind = 'brain_item' | 'text' | 'tone_preset' | 'brain_value' | 'guest_qa';

export const BRAIN_VALUE_PREFIX = 'brain_value.';

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
  label: string;
  kind: ProposableKind;
  target: 'brain_items' | 'properties' | 'property_settings' | 'brain_values';
  column?: string;
  fieldId?: string;
  valueType?: string;
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
  // Issue #133, item 6: learned guest Q&A from resolved escalations. Without
  // this entry the decision route 422'd every learning proposal — they could be
  // queued but never approved.
  'host_qa.guest_reply': {
    path: 'host_qa.guest_reply',
    label: 'Learned from an answered guest question',
    kind: 'guest_qa',
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
  section?: string | null;
  featureId?: string | null;
  replacesItemId?: string | null;
}

/** Learned guest Q&A from a resolved escalation (issue #133, item 6). */
export interface GuestQaProposal {
  question: string;
  answer: string;
  category: string;
  section: string;
  rationale?: string | null;
  model?: string;
  sourceMessageIds?: string[];
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeProposedValue(field: ProposableField, raw: unknown): NormalizeResult {
  if (field.kind === 'guest_qa') {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, error: 'That entry is missing its content.' };
    }
    const v = raw as Record<string, unknown>;
    const question = typeof v.question === 'string' ? v.question.trim() : '';
    const answer = typeof v.answer === 'string' ? v.answer.trim() : '';
    if (question.length < 8) return { ok: false, error: 'The question is too short to file.' };
    if (question.length > 500) return { ok: false, error: 'Questions are limited to 500 characters.' };
    if (answer.length < 10) return { ok: false, error: 'There is not enough content here to save.' };
    if (answer.length > MAX_BRAIN_TEXT) return { ok: false, error: 'That entry is too long to save.' };
    const section = typeof v.section === 'string' && isBrainSection(v.section.trim()) ? v.section.trim() : 'policies';
    return {
      ok: true,
      value: {
        question,
        answer,
        category: 'host_qa',
        section,
        rationale: typeof v.rationale === 'string' ? v.rationale : null,
        model: typeof v.model === 'string' ? v.model : undefined,
        sourceMessageIds: Array.isArray(v.sourceMessageIds)
          ? (v.sourceMessageIds as unknown[]).filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
          : [],
      } satisfies GuestQaProposal,
    };
  }

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
      section = 'amenities';
    }
    let replacesItemId: string | null = null;
    if (typeof v.replacesItemId === 'string' && v.replacesItemId.trim()) {
      const r = v.replacesItemId.trim();
      if (!UUID_RE.test(r)) return { ok: false, error: 'That replacement target is not valid.' };
      replacesItemId = r;
    }

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

function normalizeRegistryValue(field: ProposableField, trimmed: string): NormalizeResult {
  const max = field.maxLength ?? 500;
  if (trimmed.length > max) return { ok: false, error: `Keep this under ${max} characters.` };
  if (field.fieldId === 'wifi_password_location' && !safeWifiLocation(trimmed)) {
    return { ok: false, error: 'Describe where guests can find the password, not the password itself.' };
  }
  if (field.fieldId === 'wifi_connection_instructions' && !safeWifiInstructions(trimmed)) {
    return { ok: false, error: 'Describe the connection steps, not the password itself.' };
  }
  if (field.fieldId?.startsWith('wifi_') && redactCredentials(trimmed).redactions.length) {
    return { ok: false, error: 'Remove the credential. Save password location and connection instructions only.' };
  }

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
  oldestPendingDays: number | null;
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
