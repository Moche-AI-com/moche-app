'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { brainItemSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { getAIProvider } from '@/lib/ai';
import { chunkText } from '@/lib/ingest/chunk';
import { bumpBrainVersion } from '@/lib/brain/cache';
import { upsertNormalizedNode } from '@/lib/normalizer';
import { isBrainSection, parseFeatureSectionId, storageCategoryFor } from '@/lib/brain/taxonomy';
import { redactCredentials } from '@/lib/brain/redact';
import { safeWifiInstructions, safeWifiLocation } from '@/lib/guest/wifi-instructions';
import type { Database } from '@/lib/database.types';

export interface BrainActionState { error?: string; ok?: boolean }

function categoryFromForm(formData: FormData): string {
  const section = String(formData.get('section') ?? '');
  if (parseFeatureSectionId(section)) return storageCategoryFor('amenities');
  if (isBrainSection(section)) return storageCategoryFor(section);
  return String(formData.get('category') ?? '');
}

function sectionFromForm(formData: FormData): string | null {
  const section = String(formData.get('section') ?? '');
  if (parseFeatureSectionId(section)) return 'amenities';
  return isBrainSection(section) ? section : null;
}

export async function saveBrainItemAction(_prev: BrainActionState, formData: FormData): Promise<BrainActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property Brain.' };
  const parsed = brainItemSchema.safeParse({
    title: formData.get('title'), body: formData.get('body') ?? '',
    category: categoryFromForm(formData), visibility: formData.get('visibility') ?? 'guest',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the fields and try again.' };
  const d = parsed.data;
  if (redactCredentials(`${d.title}\n${d.body}`).redactions.length
    || /wi[\s-]?fi\s+password\s*$/i.test(d.title)
    || (/wi[\s-]?fi\s+password location/i.test(d.title) && !safeWifiLocation(d.body))
    || (/wi[\s-]?fi\s+connection instructions/i.test(d.title) && !safeWifiInstructions(d.body))) {
    return { error: 'Do not save a password or access credential. Give the exact Wi-Fi password location and connection instructions instead.' };
  }
  const section = sectionFromForm(formData);
  const featureId = parseFeatureSectionId(String(formData.get('section') ?? ''));
  const ctx = await requireSession();
  const supabase = createClient();
  if (featureId) {
    const { data: featureRow } = await supabase.from('property_features').select('id')
      .eq('id', featureId).eq('property_id', propertyId).is('archived_at', null).maybeSingle();
    if (!featureRow) return { error: 'That feature no longer exists — pick a section.' };
  }

  let savedId = itemId;
  if (itemId) {
    const updatePayload = {
      title: d.title, body: d.body || null, category: d.category, visibility: d.visibility,
      status: 'ready', updated_at: new Date().toISOString(), feature_id: featureId,
      ...(section ? { section } : {}),
    };
    const { error } = await supabase.from('brain_items').update(updatePayload as never)
      .eq('id', itemId).eq('property_id', propertyId);
    if (error) {
      log.warn('brain_update_failed', { error: error.message });
      return { error: 'Could not save the item.' };
    }
  } else {
    const insertPayload = {
      property_id: propertyId, title: d.title, body: d.body || null, category: d.category,
      visibility: d.visibility, source_type: 'manual_entry', status: 'ready', created_by: ctx.user.id,
      ...(section ? { section } : {}), ...(featureId ? { feature_id: featureId } : {}),
    };
    const { data: created, error } = await supabase.from('brain_items').insert(insertPayload as never)
      .select('id').single();
    if (error || !created) {
      log.warn('brain_create_failed', { error: error?.message });
      return { error: 'Could not create the item.' };
    }
    savedId = created.id;
  }

  const indexed = await reindexBrainItem(propertyId, savedId, d.title, d.body || '', d.visibility, d.category);
  await audit(supabase, {
    action: itemId ? 'brain.item.updated' : 'brain.item.created', actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id, propertyId, targetType: 'brain_item', targetId: savedId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return indexed ? { ok: true } : { error: 'The item was saved, but AI indexing failed. It is not ready for guest answers; retry after checking the embedding provider.' };
}

export async function deleteBrainItemAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return;
  const ctx = await requireSession();
  const supabase = createClient();
  await supabase.from('brain_items').update({ deleted_at: new Date().toISOString(), status: 'stale' })
    .eq('id', itemId).eq('property_id', propertyId);
  const admin = createAdminClient();
  await admin.from('document_chunks').delete().eq('brain_item_id', itemId).eq('property_id', propertyId);
  await bumpBrainVersion(admin, propertyId);
  await audit(supabase, {
    action: 'brain.item.deleted', actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id, propertyId, targetType: 'brain_item', targetId: itemId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
}

// False means the host's content was saved but no valid guest-search index was built.
// Existing callers may ignore the return value; the host save action must not.
export async function reindexBrainItem(
  propertyId: string, itemId: string, title: string, body: string,
  visibility: 'guest' | 'internal', category: string,
): Promise<boolean> {
  const supabase = createClient();
  const admin = createAdminClient();
  const provider = getAIProvider();
  // Fail closed: a changed item must not leave stale chunks available to guests.
  const { error: deleteError } = await admin.from('document_chunks').delete()
    .eq('brain_item_id', itemId).eq('property_id', propertyId);
  if (deleteError) {
    log.warn('chunk_delete_failed', { itemId, code: 'delete_failed' });
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId).eq('property_id', propertyId);
    return false;
  }
  await bumpBrainVersion(admin, propertyId);
  const chunks = chunkText(`${title}\n\n${body}`.trim());
  if (!chunks.length) {
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId).eq('property_id', propertyId);
    return false;
  }
  let embeddings: number[][];
  try {
    embeddings = await provider.embed(chunks);
  } catch {
    log.warn('embed_failed', { itemId, code: 'unavailable' });
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId).eq('property_id', propertyId);
    return false;
  }
  if (embeddings.length !== chunks.length) {
    log.warn('embed_failed', { itemId, code: 'vector_count_mismatch' });
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId).eq('property_id', propertyId);
    return false;
  }
  const rows = chunks.map((content, i) => ({
    property_id: propertyId, brain_item_id: itemId, document_id: null, content,
    token_count: Math.ceil(content.length / 4), chunk_index: i,
    embedding: JSON.stringify(embeddings[i]), category, visibility,
  }));
  const { error } = await admin.from('document_chunks').insert(rows as never);
  if (error) {
    log.warn('chunk_insert_failed', { itemId, code: 'insert_failed' });
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId).eq('property_id', propertyId);
    return false;
  }
  await upsertNormalizedNode(admin, {
    propertyId, brainItemId: itemId, category: category as Database['public']['Enums']['brain_category'],
    title, body,
  });
  return true;
}
