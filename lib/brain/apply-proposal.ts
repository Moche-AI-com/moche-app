import 'server-only';

// The write side of the AI approval queue (backlog P2-06).
//
// This is the ONLY place a proposed value becomes real data. It is intentionally
// a small explicit dispatcher rather than a generic "write jsonb to
// table.column" helper: a generic writer driven by a string from a database row
// is an arbitrary-write primitive, and the queue's whole purpose is to be a
// choke point. Every branch below corresponds to a hand-reviewed entry in
// PROPOSABLE_FIELDS, and an unrecognised path returns an error instead of
// touching anything.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { ingestText } from '@/lib/ingest/pipeline';
import {
  proposableField,
  normalizeProposedValue,
  type BrainItemProposal,
} from '@/lib/brain/proposals';
import { log } from '@/lib/log';

type PropertiesUpdate = Database['public']['Tables']['properties']['Update'];
type PropertySettingsUpdate = Database['public']['Tables']['property_settings']['Update'];

type Admin = SupabaseClient<Database>;

export interface ApplyInput {
  propertyId: string;
  fieldPath: string;
  /** The value the host actually approved (theirs on 'modified', the AI's on 'approve'). */
  value: unknown;
  actorProfileId: string | null;
  /** Passed through to brain ingestion for provenance. */
  sourceRef?: string | null;
}

export type ApplyResult =
  | { ok: true; targetType: string; targetId: string | null }
  | { ok: false; error: string };

export async function applyProposal(admin: Admin, input: ApplyInput): Promise<ApplyResult> {
  const field = proposableField(input.fieldPath);
  if (!field) {
    // Not a user error worth explaining in detail — it means a proposal row
    // exists for a field the current build no longer knows how to apply.
    log.warn('proposal_apply_unknown_field', { fieldPath: input.fieldPath, propertyId: input.propertyId });
    return { ok: false, error: 'This suggestion targets something this version cannot update.' };
  }

  // Re-validate at the boundary. On 'modify' the value came from a browser, and
  // on 'approve' it came from a model — neither is trusted just because a row
  // holds it.
  const normalized = normalizeProposedValue(field, input.value);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  try {
    if (field.kind === 'brain_item') {
      const v = normalized.value as BrainItemProposal;
      const result = await ingestText(admin, {
        propertyId: input.propertyId,
        title: v.title,
        text: v.text,
        category: v.category,
        visibility: v.visibility,
        sourceType: 'url',
        kind: 'url',
        sourceUrl: v.sourceUrl ?? input.sourceRef ?? null,
        createdBy: input.actorProfileId,
      });
      return { ok: true, targetType: 'brain_item', targetId: result.brainItemId };
    }

    if (field.target === 'properties') {
      const { error } = await admin
        .from('properties')
        // The column name is dynamic but constrained to the PROPOSABLE_FIELDS
        // allowlist, which only names real columns on this table. The cast is
        // needed because a computed key defeats the generated Update type; the
        // allowlist, not the type, is what keeps this honest.
        .update({ [String(field.column)]: normalized.value } as PropertiesUpdate)
        .eq('id', input.propertyId);
      if (error) throw error;
      return { ok: true, targetType: 'property', targetId: input.propertyId };
    }

    if (field.target === 'property_settings') {
      // Applying a tone also retires the legacy freeform note (P4-07): the note
      // only exists to prompt this decision, so leaving it behind would make the
      // settings page keep asking a question the host already answered.
      const patch: Record<string, unknown> = { [String(field.column)]: normalized.value };
      if (field.kind === 'tone_preset') {
        patch.legacy_tone_note = null;
        patch.legacy_tone_ack_at = new Date().toISOString();
      }
      const { error } = await admin
        .from('property_settings')
        .update(patch as PropertySettingsUpdate)
        .eq('property_id', input.propertyId);
      if (error) throw error;
      return { ok: true, targetType: 'property_settings', targetId: input.propertyId };
    }

    return { ok: false, error: 'This suggestion cannot be applied automatically.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not save that change.';
    log.warn('proposal_apply_failed', { fieldPath: input.fieldPath, propertyId: input.propertyId, error: msg });
    return { ok: false, error: msg };
  }
}
