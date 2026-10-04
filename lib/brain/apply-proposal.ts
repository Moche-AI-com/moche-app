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
  type GuestAnswerProposal,
} from '@/lib/brain/proposals';
import { bumpBrainVersion } from '@/lib/brain/cache';
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
  value: unknown;
  actorProfileId: string | null;
  sourceRef?: string | null;
}

export type ApplyResult =
  | { ok: true; targetType: string; targetId: string | null }
  | { ok: false; error: string; partial?: true; targetId?: string | null };

export async function applyProposal(admin: Admin, input: ApplyInput): Promise<ApplyResult> {
  const field = proposableField(input.fieldPath);
  if (!field) {
    log.warn('proposal_apply_unknown_field', { fieldPath: input.fieldPath, propertyId: input.propertyId });
    return { ok: false, error: 'This suggestion targets something this version cannot update.' };
  }

  const normalized = normalizeProposedValue(field, input.value);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  // Once ingestion or a canonical write starts, an error may mean partial data,
  // not a safe retry. The review queue must retain the decision in that case.
  let partial = false;
  let brainItemId: string | null = null;
  try {
    if (field.kind === 'brain_item' || field.kind === 'guest_answer') {
      const learned = field.kind === 'guest_answer' ? normalized.value as GuestAnswerProposal : null;
      if (learned && !input.actorProfileId) return { ok: false, error: 'Sign in again to approve this answer.' };
      // No normalization/generation here. The host reviewed these exact words,
      // and the proposal retains the model/message provenance plus source_ref.
      const v: BrainItemProposal = learned ? {
        title: learned.question, text: learned.answer,
        category: learned.category as BrainItemProposal['category'],
        section: learned.section, visibility: learned.visibility,
      } : normalized.value as BrainItemProposal;

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

        partial = true;
        brainItemId = target.id;
        const { error } = await admin
          .from('brain_items')
          .update({
            title: v.title,
            body: v.text,
            category: v.category,
            section: v.section,
            feature_id: v.featureId,
            visibility: v.visibility,
            status: 'processing',
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', target.id)
          .eq('property_id', input.propertyId);
        if (error) throw error;

        const indexing = await reindexBrainItem(input.propertyId, target.id, v.title, v.text, v.visibility, v.category);
        if (indexing?.indexed !== true) throw new Error('indexing_incomplete');
        const ready = await admin.from('brain_items').update({ status: 'ready' })
          .eq('id', target.id).eq('property_id', input.propertyId);
        if (ready.error) throw new Error('index_status_failed');
        await bumpBrainVersion(admin, input.propertyId);
        return { ok: true, targetType: 'brain_item', targetId: target.id };
      }

      // ADD path: ingest as a new entry, then stamp the routing decision on the
      // row — ingestText predates the section/feature columns, so the precise
      // destination is written here.
      partial = true;
      const result = await ingestText(admin, {
        propertyId: input.propertyId,
        title: v.title,
        // A short answer such as "11 AM" needs its reviewed question in the
        // retrieval chunk. Keep both verbatim; never generate padding on apply.
        text: learned ? `${learned.question}\n\n${learned.answer}` : v.text,
        category: v.category,
        visibility: v.visibility,
        sourceType: learned ? 'host_qa' : 'url',
        kind: 'url',
        // A learned source_ref is an escalation id, not an acquisition URL.
        sourceUrl: learned ? null : v.sourceUrl ?? input.sourceRef ?? null,
        createdBy: input.actorProfileId,
      });
      brainItemId = result.brainItemId;
      if (v.section || v.featureId || learned) {
        const { error } = await admin
          .from('brain_items')
          .update({ section: v.section, feature_id: v.featureId,
            // The legacy question contract allows 500 chars; ingestText's
            // generic title limit must not silently truncate approved wording.
            ...(learned ? { title: learned.question, body: learned.answer } : {}),
          } as never)
          .eq('id', result.brainItemId)
          .eq('property_id', input.propertyId);
        if (error) throw error;
      }
      await bumpBrainVersion(admin, input.propertyId);
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
      await bumpBrainVersion(admin, input.propertyId);
      return { ok: true, targetType: 'brain_value', targetId: (data as string | null) ?? null };
    }

    if (field.target === 'properties') {
      const { error } = await admin
        .from('properties')
        .update({ [String(field.column)]: normalized.value } as PropertiesUpdate)
        .eq('id', input.propertyId);
      if (error) throw error;
      await bumpBrainVersion(admin, input.propertyId);
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
      await bumpBrainVersion(admin, input.propertyId);
      return { ok: true, targetType: 'property_settings', targetId: input.propertyId };
    }

    return { ok: false, error: 'This suggestion cannot be applied automatically.' };
  } catch {
    if (partial) {
      if (brainItemId) {
        try {
          await admin.from('brain_items').update({ status: 'failed' })
            .eq('id', brainItemId).eq('property_id', input.propertyId);
        } catch {
          log.warn('proposal_apply_status_failed', { propertyId: input.propertyId, brainItemId });
        }
      }
      await bumpBrainVersion(admin, input.propertyId);
    }
    // Database/provider messages can contain approved text or credentials.
    log.warn('proposal_apply_failed', { fieldPath: input.fieldPath, propertyId: input.propertyId, partial, brainItemId });
    return {
      ok: false,
      error: partial
        ? 'Your review was saved, but indexing or filing is incomplete. Check the Brain entry before making another suggestion.'
        : 'Could not save that change.',
      ...(partial ? { partial: true as const, targetId: brainItemId } : {}),
    };
  }
}
