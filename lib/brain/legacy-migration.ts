import 'server-only';

// Migrates existing free-text brain_items into registry-backed brain_values —
// as *proposals*, never as writes (owner decision D-0011: "generate
// proposed_update rows for host review").
//
// Three constraints shaped this file:
//
//   1. No model reads the notes. Extraction is deterministic regex over text the
//      host already wrote. An LLM pass here would mean shipping stored door codes
//      and Wi-Fi passwords to a provider to decide whether they are door codes,
//      which is the exposure we are closing, not opening.
//   2. Secrets are never proposed. isRegistryProposable() already excludes
//      type === 'secret' (D-0015), and the extractor never defines a pattern for
//      one, so a matched credential has nowhere to go. Credential-shaped notes
//      stay contained by the retrieval-path redaction guard until the host enters
//      them through the secret path.
//   3. Every proposal carries its origin. source_ref points at the brain_item it
//      came from, so a host reviewing "Checkout time: 11:00" can see which note
//      said so, and §0.4 provenance/deletion has something to key on.
//
// A miss here costs nothing: the field simply stays a gap and the host answers it
// in the panel. A false positive costs a wrong pre-filled answer, so patterns are
// deliberately narrow and confidence stays below 1.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { REGISTRY_FIELDS, type RegistryField } from '@/lib/brain/completeness';
import { isRegistryProposable, BRAIN_VALUE_PREFIX } from '@/lib/brain/proposals';
import { log } from '@/lib/log';

type Client = SupabaseClient<Database>;

/** Longest value we will propose. Anything longer is a note, not a field answer. */
const MAX_VALUE_LEN = 400;

interface Extractor {
  fieldId: string;
  /** Capture group 1 is the proposed value. */
  pattern: RegExp;
  /** How much to trust a match of this shape. Never 1: a host confirms it. */
  confidence: number;
  /** Optional post-processing, e.g. normalising a clock time. */
  transform?: (raw: string) => string | null;
}

/** "11", "11 am", "11:00am", "4:00 PM" -> "11:00" / "16:00". */
function toClock(raw: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ?? '00';
  const mer = m[3]?.toLowerCase();
  if (hour > 23 || Number(minute) > 59) return null;
  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;
  // Without a meridiem, a bare "4" for check-in is ambiguous. Hosts mean
  // afternoon, but guessing wrong on a check-in time is a guest locked out, so
  // ambiguity is rejected rather than resolved.
  if (!mer && hour < 8) return null;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function firstSentence(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length > MAX_VALUE_LEN ? `${t.slice(0, MAX_VALUE_LEN - 1)}…` : t;
}

// Patterns are anchored on the words hosts actually type. Each was checked
// against the live brain_items corpus rather than invented.
const EXTRACTORS: Extractor[] = [
  {
    fieldId: 'checkout_time',
    pattern: /check\s*-?\s*out\s+(?:is|time\s+is|at)?\s*:?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    confidence: 0.8,
    transform: toClock,
  },
  {
    fieldId: 'checkin_time',
    pattern:
      /check\s*-?\s*(?:in|ing\s+in)\s+(?:is\s+)?(?:any\s*time\s+)?(?:after|from|at|is)\s*:?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
    confidence: 0.8,
    transform: toClock,
  },
  {
    // Network name only. The password sits in the same sentence in most notes and
    // is deliberately not captured — see constraint 2 above.
    fieldId: 'wifi_network_name',
    // /m so a value terminated by a line break ("Wifi Name = X\r\nPass Word = Y")
    // ends at the line, not at the end of the note.
    pattern: /(?:wi\s*-?\s*fi|wifi|network)\s*(?:name)?\s*(?:is|=|:)\s*([^\n\r,;]{2,60}?)(?:\s+and\s+|\s*[,;]|\s*$)/im,
    confidence: 0.6,
    transform: (raw) => {
      const v = raw.trim().replace(/^["']|["']$/g, '');
      // "the password" and friends mean the pattern latched onto the wrong clause.
      return /pass\s*word|^is$|^the$/i.test(v) ? null : v;
    },
  },
  {
    fieldId: 'quiet_hours',
    pattern: /quiet\s+hours?[^.\n]{0,80}/i,
    confidence: 0.7,
    transform: firstSentence,
  },
  {
    fieldId: 'smoking_policy',
    pattern: /((?:no|non)[\s-]?smoking[^.\n]{0,80}|smoking\s+is[^.\n]{0,80})/i,
    confidence: 0.7,
    transform: firstSentence,
  },
  {
    fieldId: 'pet_policy',
    pattern: /((?:no\s+pets|pets?\s+(?:are\s+)?(?:allowed|welcome|permitted|not\s+allowed))[^.\n]{0,80})/i,
    confidence: 0.7,
    transform: firstSentence,
  },
  {
    fieldId: 'late_checkout_policy',
    pattern: /(late\s+check\s*-?\s*out[^.\n]{0,120})/i,
    confidence: 0.6,
    transform: firstSentence,
  },
  {
    fieldId: 'checkin_flexibility',
    pattern: /(early\s+check\s*-?\s*in[^.\n]{0,120})/i,
    confidence: 0.6,
    transform: firstSentence,
  },
  {
    fieldId: 'max_occupancy',
    pattern: /(?:sleeps|max(?:imum)?\s+(?:of\s+)?(?:occupancy|guests)(?:\s+is)?)\s*:?\s*(\d{1,2})/i,
    confidence: 0.7,
  },
  {
    fieldId: 'trash_schedule',
    pattern: /((?:trash|garbage|recycling)[^.\n]{0,120})/i,
    confidence: 0.5,
    transform: firstSentence,
  },
];

export interface MigrationCandidate {
  fieldId: string;
  fieldPath: string;
  label: string;
  value: string;
  confidence: number;
  /** brain_items.id the text came from. */
  sourceItemId: string;
  sourceTitle: string;
}

function registryField(fieldId: string): RegistryField | undefined {
  return REGISTRY_FIELDS.find((f) => f.field_id === fieldId);
}

export interface LegacyNote {
  id: string;
  title: string;
  body: string;
}

/**
 * Pure extraction step, exported so it can be tested without a database.
 *
 * When several notes yield the same field, the highest-confidence match wins and
 * ties break toward the first note. One proposal per field means the host makes
 * one decision, not five about the same question.
 */
export function extractCandidates(notes: LegacyNote[]): MigrationCandidate[] {
  const best = new Map<string, MigrationCandidate>();

  for (const note of notes) {
    const text = `${note.title}\n${note.body}`;
    for (const ex of EXTRACTORS) {
      const field = registryField(ex.fieldId);
      // A field that is not proposable (secret, or system section) is skipped
      // even if an extractor exists for it, so the guard cannot be bypassed by
      // adding a pattern.
      if (!field || !isRegistryProposable(field)) continue;

      const m = ex.pattern.exec(text);
      if (!m) continue;
      const raw = (m[1] ?? m[0]).trim();
      if (!raw) continue;
      const value = ex.transform ? ex.transform(raw) : firstSentence(raw);
      if (!value) continue;

      const prior = best.get(ex.fieldId);
      if (prior && prior.confidence >= ex.confidence) continue;
      best.set(ex.fieldId, {
        fieldId: ex.fieldId,
        fieldPath: `${BRAIN_VALUE_PREFIX}${ex.fieldId}`,
        label: field.label,
        value,
        confidence: ex.confidence,
        sourceItemId: note.id,
        sourceTitle: note.title,
      });
    }
  }

  return [...best.values()].sort((a, b) => a.fieldId.localeCompare(b.fieldId));
}

export interface MigrationResult {
  scannedNotes: number;
  candidates: number;
  inserted: number;
  skippedExisting: number;
}

/**
 * Scans a property's brain_items and queues review proposals for whatever the
 * registry can recognise. Idempotent: a field that already has a live value or an
 * open proposal is left alone, so this can be re-run after the registry gains
 * extractors without duplicating the host's work.
 */
export async function proposeFromLegacyNotes(
  admin: Client,
  propertyId: string,
  hostAccountId: string,
): Promise<MigrationResult> {
  const { data: notes, error: notesError } = await admin
    .from('brain_items')
    .select('id, title, body')
    .eq('property_id', propertyId);
  if (notesError) throw new Error(`Could not read existing notes: ${notesError.message}`);

  const candidates = extractCandidates(
    (notes ?? []).map((n) => ({ id: n.id, title: n.title ?? '', body: n.body ?? '' })),
  );
  if (candidates.length === 0) {
    return { scannedNotes: notes?.length ?? 0, candidates: 0, inserted: 0, skippedExisting: 0 };
  }

  const [{ data: activeValues }, { data: openProposals }] = await Promise.all([
    admin.from('brain_values').select('field_id').eq('property_id', propertyId).eq('status', 'active'),
    admin
      .from('proposed_updates')
      .select('field_path')
      .eq('property_id', propertyId)
      .in('status', ['pending', 'modified']),
  ]);

  const taken = new Set<string>([
    ...(activeValues ?? []).map((v) => `${BRAIN_VALUE_PREFIX}${v.field_id}`),
    ...(openProposals ?? []).map((p) => p.field_path),
  ]);

  const fresh = candidates.filter((c) => !taken.has(c.fieldPath));
  const skippedExisting = candidates.length - fresh.length;
  if (fresh.length === 0) {
    return { scannedNotes: notes?.length ?? 0, candidates: candidates.length, inserted: 0, skippedExisting };
  }

  const { error: insertError, count } = await admin.from('proposed_updates').insert(
    fresh.map((c) => ({
      property_id: propertyId,
      host_account_id: hostAccountId,
      field_path: c.fieldPath,
      label: c.label,
      proposed_value: c.value as unknown as Json,
      confidence: c.confidence,
      source_type: 'registry_migration',
      source_ref: c.sourceItemId,
      status: 'pending' as const,
    })),
    { count: 'exact' },
  );
  if (insertError) throw new Error(`Could not queue proposals: ${insertError.message}`);

  log.info('brain.legacy_migration_proposed', {
    propertyId,
    scannedNotes: notes?.length ?? 0,
    // Field ids only. Extracted values are host content and are not logged.
    fields: fresh.map((c) => c.fieldId),
  });

  return {
    scannedNotes: notes?.length ?? 0,
    candidates: candidates.length,
    inserted: count ?? fresh.length,
    skippedExisting,
  };
}
