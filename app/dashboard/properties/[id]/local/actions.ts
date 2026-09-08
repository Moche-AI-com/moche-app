'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPropertyAccess, getUser } from '@/lib/auth/guards';
import { normalizePlaceAddress, normalizePlaceName } from '@/lib/local/dedupe';
import { refreshNearbyPlaces } from '@/lib/local/nearby';
import { localPlaceSchema, validCoordinates, type LocalPlaceInput } from '@/lib/local/validation';
import { haversineMeters } from '@/lib/local/distance';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface LocalRefreshState { error?: string; ok?: boolean; found?: number }
export interface LocalSaveState { error?: string; ok?: boolean; message?: string }

function localPath(propertyId: string): string { return `/dashboard/properties/${propertyId}/local`; }

async function authorize(formData: FormData) {
  const propertyId = String(formData.get('propertyId') ?? '');
  if (!z.string().uuid().safeParse(propertyId).success) return null;
  const access = await getPropertyAccess(propertyId);
  if (!access?.can.editBrain) return null;
  const user = await getUser();
  if (!user) return null;
  return { propertyId, access, user };
}

function parsePlace(formData: FormData) {
  const fields = ['name', 'category', 'address', 'website', 'phone', 'lat', 'lng', 'hostNote', 'tags', 'intentTags', 'isFavorite', 'status'];
  const input = Object.fromEntries(fields.filter((key) => formData.has(key)).map((key) => [key, formData.get(key)]));
  // The client cannot relabel a provider result as a manual place.
  if (formData.has('provider') || formData.has('provider_payload') || formData.has('providerPlaceId')) input.provider = formData.get('provider');
  return localPlaceSchema.safeParse(input);
}

function placeFields(input: LocalPlaceInput) {
  return {
    provider: 'manual', provider_place_id: null, provider_payload: null,
    name: input.name, normalized_name: normalizePlaceName(input.name), category: input.category,
    address: input.address, lat: input.lat, lon: input.lng, website: input.website, phone: input.phone,
  };
}

function relationshipFields(input: LocalPlaceInput, userId: string, coords: { lat?: number | null; lng?: number | null }) {
  return {
    status: input.status, host_note: input.hostNote, tags: input.tags, intent_tags: input.intentTags,
    is_favorite: input.isFavorite,
    approved_by: input.status === 'approved' ? userId : null,
    approved_at: input.status === 'approved' ? new Date().toISOString() : null,
    distance_miles: validCoordinates(input.lat, input.lng) && validCoordinates(coords.lat, coords.lng)
      ? haversineMeters(coords.lat!, coords.lng!, input.lat!, input.lng!) / 1609.344 : null,
  };
}

export async function refreshLocalPlacesAction(_prev: LocalRefreshState, formData: FormData): Promise<LocalRefreshState> {
  const auth = await authorize(formData);
  if (!auth) return { error: 'You do not have permission to edit this property.' };
  const { propertyId, access, user } = auth;
  const p = access.property as { lat: number | null; lng: number | null };
  if (!validCoordinates(p.lat, p.lng)) return { error: 'Set the property location in Configuration → Address first.' };
  const admin = createAdminClient();
  const rate = await checkRateLimit(admin, { key: `local-refresh:${propertyId}:${user.id}`, limit: 3, windowSeconds: 300, action: 'local_refresh' });
  if (!rate.allowed) return { error: 'Please wait a few minutes before refreshing again.' };
  try {
    const result = await refreshNearbyPlaces(propertyId, p);
    if (!result.ok) return { error: 'Could not fetch nearby places right now. Please try again.' };
    await audit(admin, {
      action: 'local_places.refreshed', actorProfileId: user.id, hostAccountId: access.property.host_account_id,
      propertyId, targetType: 'property', targetId: propertyId,
    });
    revalidatePath(localPath(propertyId));
    return { ok: true, found: result.found };
  } catch {
    return { error: 'Could not refresh nearby places. Your saved places are unchanged.' };
  }
}

export async function addManualLocalPlaceAction(_prev: LocalSaveState, formData: FormData): Promise<LocalSaveState> {
  const auth = await authorize(formData);
  if (!auth) return { error: 'You do not have permission to edit this property.' };
  const parsed = parsePlace(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the place details.' };
  const { propertyId, access, user } = auth;
  const input = parsed.data;
  const admin = createAdminClient();
  try {
    // Manual records are not a global address book: only dedupe this property's
    // relationships, and never overwrite its existing notes/status on a retry.
    const { data: existing, error: readError } = await admin.from('property_place_recommendations')
      .select('id, places!inner(name, address, category, lat, lon)')
      .eq('property_id', propertyId).limit(1000);
    if (readError) return { error: 'Could not check your saved places. Please try again.' };
    const duplicate = (existing ?? []).some((row) => {
      const p = row.places as unknown as { name: string; address: string | null; category: string; lat: number | null; lon: number | null };
      return normalizePlaceName(p.name) === normalizePlaceName(input.name) && p.category === input.category
        && normalizePlaceAddress(p.address) === normalizePlaceAddress(input.address)
        && p.lat === input.lat && p.lon === input.lng;
    });
    if (duplicate) return { error: 'This place is already saved. Edit its existing card instead.' };
    const { data: place, error: placeError } = await admin.from('places')
      .insert(placeFields(input) as never).select('id').single();
    if (placeError || !place) return { error: 'The place could not be saved. Please try again.' };
    const { error } = await admin.from('property_place_recommendations').insert({
      ...relationshipFields(input, user.id, access.property),
      property_id: propertyId, place_id: place.id,
    } as never);
    if (error) return { error: 'The place could not be added to this property. Please try again.' };
    await audit(admin, {
      action: 'local_place.added', actorProfileId: user.id, hostAccountId: access.property.host_account_id,
      propertyId, targetType: 'property', targetId: propertyId,
    });
    revalidatePath(localPath(propertyId));
    return { ok: true, message: input.status === 'approved' ? 'Place added and shared with guests.' : 'Place saved. Only recommended places are shared with guests.' };
  } catch {
    log.warn('local_place_save_failed', { propertyId });
    return { error: 'Could not save the place. Please try again.' };
  }
}

export async function updateLocalPlaceAction(_prev: LocalSaveState, formData: FormData): Promise<LocalSaveState> {
  const auth = await authorize(formData);
  if (!auth) return { error: 'You do not have permission to edit this property.' };
  const recommendationId = String(formData.get('recommendationId') ?? '');
  if (!z.string().uuid().safeParse(recommendationId).success) return { error: 'Place not found.' };
  const parsed = parsePlace(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the place details.' };
  const { propertyId, access, user } = auth;
  const input = parsed.data;
  const admin = createAdminClient();
  try {
    // Both ids are required BEFORE any privileged write, including a place copy.
    const { data: current, error: readError } = await admin.from('property_place_recommendations')
      .select('id, place_id, places!inner(name, category, address, website, phone, lat, lon)')
      .eq('id', recommendationId).eq('property_id', propertyId).maybeSingle();
    if (readError) return { error: 'Could not load this place. Please try again.' };
    if (!current?.places) return { error: 'Place not found in this property.' };
    const original = current.places as unknown as Record<string, unknown>;
    const fields = placeFields(input);
    const detailsChanged = (['name', 'category', 'address', 'website', 'phone', 'lat', 'lon'] as const)
      .some((key) => (original[key] ?? null) !== fields[key]);
    let placeId = current.place_id;
    if (detailsChanged) {
      // Copy-on-write: a canonical OSM/manual identity may be linked to other
      // properties. Correcting this host's details must never modify their data.
      const { data: copy, error: copyError } = await admin.from('places').insert(fields as never).select('id').single();
      if (copyError || !copy) return { error: 'The updated details could not be saved.' };
      placeId = copy.id;
    }
    const { data: updated, error } = await admin.from('property_place_recommendations')
      .update({ ...relationshipFields(input, user.id, access.property), place_id: placeId } as never)
      .eq('id', recommendationId).eq('property_id', propertyId).select('id').maybeSingle();
    if (error || !updated) return { error: 'The place could not be updated. Please try again.' };
    await audit(admin, {
      action: 'local_place.updated', actorProfileId: user.id, hostAccountId: access.property.host_account_id,
      propertyId, targetType: 'property', targetId: propertyId,
    });
    revalidatePath(localPath(propertyId));
    return { ok: true, message: 'Place saved.' };
  } catch {
    log.warn('local_place_update_failed', { propertyId });
    return { error: 'Could not update the place. Please try again.' };
  }
}
