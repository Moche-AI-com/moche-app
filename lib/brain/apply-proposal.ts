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
// reindexBrainItem lives in the Brain page's action module today. It is an async
// export (legal for a 'use server' file) and is imported here rather than
// duplicated: a replace-apply must rebuild chunks + embeddings exactly the way a
// manual save does, or the two paths drift.
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';
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

      // A feature link is property-scoped data arriving via a queue row: verify the
      // feature belongs to this property and is active before writing it, in either
      // path below.
      if (v.featureId) {
        const { data: featureRow } = await admin
          .from('property_features')
          .select('id')
          .eq('id', v.featureId)
          .eq('property_id', input.propertyId)
          .is('archived_at', null)
          .maybeSingle();
        if (!featureRow) return { ok: false, error: 'The feature this targets no longer exists.' };
      }

      // REPLACE path (2026-08-28): update the existing entry in place and reindex
      // it, so an approved correction never becomes a second copy the concierge
      // can retrieve twice. The add/replace decision was made when the update was
      // drafted and is carried on the value — approval here is deterministic.
      if (v.replacesItemId) {
        const { data: target } = await admin
          .from('brain_items')
          .select('id')
          .eq('id', v.replacesItemId)
          .eq('property_id', input.propertyId)
          .is('deleted_at', null)
          .maybeSingle();
        if (!target) return { ok: false, error: 'The entry this update replaces no longer exists.' };

        const { error } = await admin
          .from('brain_items')
          .update({
            title: v.title,
            body: v.text,
            category: v.category,
            section: v.section,
            feature_id: v.featureId,
            visibility: v.visibility,
            status: 'ready',
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', target.id)
          .eq('property_id', input.propertyId);
        if (error) throw error;

        await reindexBrainItem(input.propertyId, target.id, v.title, v.text, v.visibility, v.category);
        return { ok: true, targetType: 'brain_item', targetId: target.id };
      }

      // ADD path: ingest as a new entry, then stamp the routing decision on the
      // row — ingestText predates the section/feature columns, so the precise
      // destination is written here.
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
      if (v.section || v.featureId) {
        const { error } = await admin
          .from('brain_items')
          .update({ section: v.section, feature_id: v.featureId } as never)
          .eq('id', result.brainItemId)
          .eq('property_id', input.propertyId);
        if (error) throw error;
      }
      return { ok: true, targetType: 'brain_item', targetId: result.brainItemId };
    }

    if (field.kind === 'brain_value') {
      // A brain_values row written with source 'host_verified' records who
      // verified it. Applying one with no known actor would produce an
      // unattributable claim of host verification, so refuse rather than write
      // an anonymous one.
      if (!input.actorProfileId) {
        return { ok: false, error: 'Sign in again to approve this value.' };
      }
      // Everything about the envelope row — sensitivity tier, audience, TTL,
      // version, superseding the prior value — is decided by the database from
      // field_registry. This call deliberately passes no tier and no audience:
      // the trigger would reject a widened one anyway, and duplicating the
      // registry here would create a second source of truth for who may see a
      // value.
      const { data, error } = await admin.rpc('brain_values_set', {
        p_property_id: input.propertyId,
        p_field_id: String(field.fieldId),
        p_value: normalized.value as never,
        p_source: 'host_verified',
        p_confidence: 1,
        p_actor: input.actorProfileId,
      });

      if (error) throw error;
      return { ok: true, targetType: 'brain_value', targetId: (data as string | null) ?? null };
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
