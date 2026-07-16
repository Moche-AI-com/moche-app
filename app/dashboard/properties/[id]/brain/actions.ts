'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { brainItemSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { getAIProvider } from '@/lib/ai';
import { chunkText } from '@/lib/ingest/chunk';

export interface BrainActionState {
  error?: string;
  ok?: boolean;
}

// Create or update a manual Brain item. After saving, (re)build its chunks + embeddings
// so the concierge can retrieve it. Embedding happens through the AI provider abstraction.
export async function saveBrainItemAction(
  _prev: BrainActionState,
  formData: FormData,
): Promise<BrainActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property Brain.' };

  const parsed = brainItemSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body') ?? '',
    category: formData.get('category'),
    visibility: formData.get('visibility') ?? 'guest',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check the fields and try again.' };
  }
  const d = parsed.data;
  const ctx = await requireSession();
  const supabase = createClient();

  let savedId = itemId;
  if (itemId) {
    const { error } = await supabase
      .from('brain_items')
      .update({
        title: d.title,
        body: d.body || null,
        category: d.category,
        visibility: d.visibility,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('property_id', propertyId);
    if (error) {
      log.warn('brain_update_failed', { error: error.message });
      return { error: 'Could not save the item.' };
    }
  } else {
    const { data: created, error } = await supabase
      .from('brain_items')
      .insert({
        property_id: propertyId,
        title: d.title,
        body: d.body || null,
        category: d.category,
        visibility: d.visibility,
        source_type: 'manual_entry',
        status: 'ready',
        created_by: ctx.user.id,
      })
      .select('id')
      .single();
    if (error || !created) {
      log.warn('brain_create_failed', { error: error?.message });
      return { error: 'Could not create the item.' };
    }
    savedId = created.id;
  }

  await reindexBrainItem(propertyId, savedId, d.title, d.body || '', d.visibility, d.category);

  await audit(supabase, {
    action: itemId ? 'brain.item.updated' : 'brain.item.created',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'brain_item',
    targetId: savedId,
  });

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return { ok: true };
}

export async function deleteBrainItemAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const itemId = String(formData.get('itemId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return;
  const ctx = await requireSession();
  const supabase = createClient();

  // Soft-delete the item and hard-delete its chunks so it stops being retrievable immediately.
  await supabase
    .from('brain_items')
    .update({ deleted_at: new Date().toISOString(), status: 'stale' })
    .eq('id', itemId)
    .eq('property_id', propertyId);
  await supabase.from('document_chunks').delete().eq('brain_item_id', itemId).eq('property_id', propertyId);

  await audit(supabase, {
    action: 'brain.item.deleted',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'brain_item',
    targetId: itemId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
}

// Rebuild the chunk + embedding rows for a single brain item.
// Property isolation: every chunk row carries property_id, and retrieval is via
// match_property_chunks(property_id, ...) which filters in the DB.
export async function reindexBrainItem(
  propertyId: string,
  itemId: string,
  title: string,
  body: string,
  visibility: 'guest' | 'internal',
  category: string,
): Promise<void> {
  const supabase = createClient();
  const provider = getAIProvider();

  // Clear existing chunks for this item.
  await supabase.from('document_chunks').delete().eq('brain_item_id', itemId).eq('property_id', propertyId);

  const full = `${title}\n\n${body}`.trim();
  const chunks = chunkText(full);
  if (chunks.length === 0) return;

  let embeddings: number[][];
  try {
    embeddings = await provider.embed(chunks);
  } catch (e) {
    log.warn('embed_failed', { itemId, error: String(e) });
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId);
    return;
  }

  const rows = chunks.map((content, i) => ({
    property_id: propertyId,
    brain_item_id: itemId,
    document_id: null,
    content,
    token_count: Math.ceil(content.length / 4),
    chunk_index: i,
    embedding: JSON.stringify(embeddings[i]),
    category,
    visibility,
  }));

  const { error } = await supabase.from('document_chunks').insert(rows as never);
  if (error) {
    log.warn('chunk_insert_failed', { itemId, error: error.message });
    await supabase.from('brain_items').update({ status: 'failed' }).eq('id', itemId);
  }
}
