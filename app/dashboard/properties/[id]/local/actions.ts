'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, getUser } from '@/lib/auth/guards';
import { normalizePlaceAddress, normalizePlaceName } from '@/lib/local/dedupe';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

const MAX_NOTE = 500;
const VALID_STATUSES = new Set(['suggested', 'approved', 'hidden']);

function localPath(propertyId: string): string {
  return `/dashboard/properties/${propertyId}/local`;
}

function tagsFrom(formData: FormData, name: string): string[] {
  return Array.from(new Set(
    String(formData.get(name) ?? '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12),
  ));
}

export async function addManualLocalPlaceAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return;

  const name = String(formData.get('name') ?? '').trim().slice(0, 160);
  const category = String(formData.get('category') ?? 'attraction').trim().slice(0, 80) || 'attraction';
  const address = String(formData.get('address') ?? '').trim().slice(0, 500) || null;
  const hostNote = String(formData.get('hostNote') ?? '').trim().slice(0, MAX_NOTE) || null;
  if (!name) return;

  const normalizedName = normalizePlaceName(name);
  const normalizedAddress = normalizePlaceAddress(address);
  const admin = createAdminClient();

  // Manual entries do not have a provider id. Reuse the exact canonical identity
  // if the host has already added the same named place at the same address.
  const { data: existing } = await admin
    .from('places')
    .select('id, address')
    .eq('provider', 'manual')
    .eq('normalized_name', normalizedName)
    .eq('category', category);
  const match = (existing ?? []).find((place) => normalizePlaceAddress(place.address) === normalizedAddress);

  let placeId = match?.id;
  if (!placeId) {
    const { data: place, error } = await admin
      .from('places')
      .insert({
        provider: 'manual', provider_place_id: null, name, normalized_name: normalizedName,
        category, address, provider_payload: null,
      } as never)
      .select('id')
      .single();
    if (error || !place) {
      log.warn('local_manual_place_insert_failed', { propertyId, error: error?.message });
      return;
    }
    placeId = place.id;
  }

  const user = await getUser();
  const { error } = await admin
    .from('property_place_recommendations')
    .upsert({
      property_id: propertyId, place_id: placeId, status: 'approved', host_note: hostNote,
      tags: tagsFrom(formData, 'tags'), intent_tags: tagsFrom(formData, 'intentTags'),
      is_favorite: formData.get('isFavorite') === 'true', approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    } as never, { onConflict: 'property_id,place_id' });
  if (error) {
    log.warn('local_manual_recommendation_insert_failed', { propertyId, error: error.message });
    return;
  }

  await audit(admin, {
    action: 'local_place.added', actorProfileId: user?.id ?? null,
    hostAccountId: access.property.host_account_id, propertyId,
    targetType: 'property', targetId: propertyId,
  });
  revalidatePath(localPath(propertyId));
}

export async function updateLocalPlaceAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const recommendationId = String(formData.get('recommendationId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain || !recommendationId) return;

  const statusValue = String(formData.get('status') ?? 'suggested');
  const status = VALID_STATUSES.has(statusValue) ? statusValue : 'suggested';
  const user = await getUser();
  const patch = {
    status,
    host_note: String(formData.get('hostNote') ?? '').trim().slice(0, MAX_NOTE) || null,
    tags: tagsFrom(formData, 'tags'),
    intent_tags: tagsFrom(formData, 'intentTags'),
    is_favorite: formData.get('isFavorite') === 'true',
    approved_by: status === 'approved' ? user?.id ?? null : null,
    approved_at: status === 'approved' ? new Date().toISOString() : null,
  };

  const admin = createAdminClient();
  const { error } = await admin
    .from('property_place_recommendations')
    .update(patch as never)
    .eq('id', recommendationId)
    .eq('property_id', propertyId);
  if (error) {
    log.warn('local_recommendation_update_failed', { propertyId, recommendationId, error: error.message });
    return;
  }
  revalidatePath(localPath(propertyId));
}
