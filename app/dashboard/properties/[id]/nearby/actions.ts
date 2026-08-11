'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, requireSession } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { refreshNearbyPlaces } from '@/lib/local/nearby';
import { CURATION_TAG_LABEL } from '@/lib/local/categories';

export interface NearbyActionState {
  error?: string;
  ok?: boolean;
  found?: number;
}

// Host clicks "Refresh nearby places": re-query Overpass and upsert results.
// Host curation (star/note/hide) is preserved across refreshes.
export async function refreshNearbyPlacesAction(
  _prev: NearbyActionState,
  formData: FormData,
): Promise<NearbyActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const p = access.property as { lat: number | null; lng: number | null };
  if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
    return { error: 'Set the property location first (Settings → Address) so we can find nearby places.' };
  }

  const result = await refreshNearbyPlaces(propertyId, { lat: p.lat, lng: p.lng });
  if (!result.ok && result.skipped !== 'no_results') {
    return { error: 'Could not fetch nearby places right now. Please try again in a moment.' };
  }

  const ctx = await requireSession();
  await audit(createClient(), {
    action: 'nearby_places.refreshed',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });

  revalidatePath(`/dashboard/properties/${propertyId}/local`);
  return { ok: true, found: result.found };
}

// Host curation: star / note / hide. One action handles all three; only the
// provided fields are patched. Guarded by editProperty; writes via service role.
export async function updateNearbyPlaceAction(
  _prev: NearbyActionState,
  formData: FormData,
): Promise<NearbyActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const placeRowId = String(formData.get('placeId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };
  if (!placeRowId) return { error: 'Missing place.' };

  const patch: Record<string, unknown> = {};
  if (formData.has('host_starred')) patch.host_starred = formData.get('host_starred') === 'true';
  if (formData.has('hidden')) patch.hidden = formData.get('hidden') === 'true';
  if (formData.has('host_notes')) patch.host_notes = String(formData.get('host_notes') ?? '').slice(0, 500) || null;
  if (formData.has('tags')) {
    const raw = formData.getAll('tags').map((t) => String(t));
    patch.tags = Array.from(new Set(raw.filter((t) => t in CURATION_TAG_LABEL)));
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  // Any curation touch (star, hide, note, tag) marks the place reviewed — this is
  // what lets the UI and the coverage indicator distinguish "never looked at" from
  // "host has seen this and left it as-is."
  patch.reviewed_at = new Date().toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from('nearby_places')
    .update(patch as never)
    .eq('id', placeRowId)
    .eq('property_id', propertyId);
  if (error) {
    log.warn('nearby_update_failed', { error: error.message });
    return { error: 'Could not update that place.' };
  }

  revalidatePath(`/dashboard/properties/${propertyId}/local`);
  return { ok: true };
}
