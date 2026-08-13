import 'server-only';

// Accepting one structured field from a listing import (directive §1).
//
// This is the mirror of acceptImportedGroup, but for a mapped field rather than
// a block of sentences. It goes through the same choke point on purpose:
// createProposal -> applyProposal -> mark approved. Writing directly to
// brain_values or properties from here would create a second write path into the
// Brain with no queue row behind it, which is exactly what Boundary 4 exists to
// prevent — and it would lose the provenance the host needs later to answer
// "where did this number come from".

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { applyProposal } from '@/lib/brain/apply-proposal';
import { createProposal } from '@/lib/brain/proposal-store';
import { proposableField } from '@/lib/brain/proposals';
import type { ExtractedField } from './fields';

type Client = SupabaseClient<Database>;

export interface AcceptFieldInput {
  propertyId: string;
  hostAccountId: string;
  actorProfileId: string;
  sourceUrl: string;
  /** The field as extracted — carries the trusted fieldPath and section. */
  field: ExtractedField;
  /**
   * The host's edited value, if they changed it. Only the value is editable; the
   * target path comes from the stored artifact, never from the request, so a
   * crafted request cannot redirect an accepted value at a different field.
   */
  editedValue?: string | number | null;
}

export type AcceptFieldResult =
  | { ok: true; proposalId: string; targetId: string | null }
  | { ok: false; error: string };

export async function acceptExtractedField(admin: Client, input: AcceptFieldInput): Promise<AcceptFieldResult> {
  const field = proposableField(input.field.fieldPath);
  if (!field) return { ok: false, error: 'This detail cannot be saved by this version.' };

  const value = valueFor(input.field, input.editedValue);
  if (value === null) return { ok: false, error: 'Enter a value before saving this detail.' };

  const proposal = await createProposal(admin, {
    propertyId: input.propertyId,
    hostAccountId: input.hostAccountId,
    fieldPath: input.field.fieldPath,
    label: input.field.label,
    proposedValue: value,
    originalValue: null,
    sourceType: 'listing_url',
    sourceRef: input.sourceUrl,
    confidence: input.field.confidence,
  });
  if (!proposal.ok) return proposal;

  const applied = await applyProposal(admin, {
    propertyId: input.propertyId,
    fieldPath: input.field.fieldPath,
    value,
    actorProfileId: input.actorProfileId,
    sourceRef: input.sourceUrl,
  });
  if (!applied.ok) {
    // The queue row stays pending rather than being marked approved. A failed
    // apply that reported success would tell the host the fact is in the Brain
    // when it is not.
    return { ok: false, error: applied.error };
  }

  const now = new Date().toISOString();
  const { error } = await admin.from('proposed_updates').update({
    status: 'approved',
    reviewed_at: now,
    reviewed_by: input.actorProfileId,
    applied_at: now,
    applied_value: value as Database['public']['Tables']['proposed_updates']['Update']['applied_value'],
  }).eq('id', proposal.id);
  if (error) return { ok: false, error: 'The detail was saved but its review record could not be finalized.' };

  return { ok: true, proposalId: proposal.id, targetId: applied.targetId };
}

/**
 * Composed brain_item fields keep their structured envelope and take the host's
 * edit as the body text. Scalar fields take the edit verbatim. Numbers are
 * re-parsed rather than trusted, because the edit arrives as a form string.
 */
function valueFor(field: ExtractedField, edited: string | number | null | undefined): unknown {
  const isObjectValue = typeof field.value === 'object' && field.value !== null;
  if (isObjectValue) {
    const base = field.value as { title: string; text: string; category: string; visibility: 'guest' };
    const text = typeof edited === 'string' && edited.trim().length > 0 ? edited.trim() : base.text;
    return { ...base, text };
  }
  if (edited === null || edited === undefined || (typeof edited === 'string' && edited.trim().length === 0)) {
    return typeof field.value === 'number' ? String(field.value) : field.value;
  }
  return typeof edited === 'number' ? String(edited) : edited.trim();
}
