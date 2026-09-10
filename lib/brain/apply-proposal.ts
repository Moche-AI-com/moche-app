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
  type GuestQaProposal,
} from '@/lib/brain/proposals';
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';
import { log } from '@/lib/log';

type PropertiesUpdate = Database['public']['Tables']['properties']['Update'];
type PropertySettingsUpdate = Database['public']['Tables']['property_settings']['Update'];

type Admin = SupabaseClient<Database>;

export interface ApplyInput {
  propertyId: string;
  fieldPath: string;
  value: unknown;
  actorProfileId: string | null;
  sourceRef?: string | null;
}

export type ApplyResult =
  | { ok: true; targetType: string; targetId: string | null }
  | { ok: false; error: string };

export async function applyProposal(admin: Admin, input: ApplyInput): Promise<ApplyResult> {
  const field = proposableField(input.fieldPath);
  if (!field) {
    log.warn('proposal_apply_unknown_field', { fieldPath: input.fieldPath, propertyId: input.propertyId });
    return { ok: false, error: 'This suggestion targets something this version cannot update.' };
  }

  const normalized = normalizeProposedValue(field, input.value);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  try {
    if (field.kind === 'guest_qa') {
      // Issue #133, item 6: learned guest Q&A files as a host_qa brain entry —
      // the question as the entry title, the normalized answer as the body, and
      // the escalation id as provenance.
      const v = normalized.value as GuestQaProposal;
      const result = await ingestText(admin, {
        propertyId: input.propertyId,
        title: v.question,
        text: v.answer,
        category: 'host_qa',
        visibility: 'guest',
        sourceType: 'url',
        kind: 'url',
        sourceUrl: input.sourceRef ?? null,
        createdBy: input.actorProfileId,
      });
      const { error } = await admin
        .from('brain_items')
        .update({ section: v.section } as never)
        .eq('id', result.brainItemId)
        .eq('property_id', input.propertyId);
      if (error) throw error;
      return { ok: true, targetType: 'brain_item', targetId: result.brainItemId };
    }

    if (field.kind === 'brain_item') {
      const v = normalized.value as BrainItemProposal;

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
      if (!input.actorProfileId) {
        return { ok: false, error: 'Sign in again to approve this value.' };
      }
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
        .update({ [String(field.column)]: normalized.value } as PropertiesUpdate)
        .eq('id', input.propertyId);
      if (error) throw error;
      return { ok: true, targetType: 'property', targetId: input.propertyId };
    }

    if (field.target === 'property_settings') {
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
