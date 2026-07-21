'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, requireSession } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { bumpBrainVersion } from '@/lib/brain/cache';
import { discoverLocalIntel, type LocalPoi } from '@/lib/local/osm';
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';

export interface RecActionState {
  error?: string;
  ok?: boolean;
  found?: number;
}

type HostPreference = 'loved' | 'neutral' | 'disliked';

// Human labels for the OSM category codes, used when projecting to the Brain.
const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  attraction: 'Attraction',
  grocery: 'Grocery',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital / Urgent care',
};

function metersToFriendly(m: number | null): string | null {
  if (m == null) return null;
  if (m < 950) return `${Math.round(m / 50) * 50} m away`;
  return `${(m / 1000).toFixed(1)} km away`;
}

// ---------------------------------------------------------------------------
// C3 — Discover nearby places from FREE OSM sources and STAGE them for review.
// Staged rows are approved=false; nothing reaches guests until the host approves.
// ---------------------------------------------------------------------------
export async function discoverLocalIntelAction(
  _prev: RecActionState,
  formData: FormData,
): Promise<RecActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };

  const p = access.property as {
    address_line1: string | null; city: string | null; region: string | null;
    postal_code: string | null; country: string | null;
  };
  const address = [p.address_line1, p.city, p.region, p.postal_code, p.country]
    .filter(Boolean).join(', ');
  if (!address.trim()) {
    return { error: 'Add the property address first (Settings) so we can find nearby places.' };
  }

  const { geocode, pois } = await discoverLocalIntel(address);
  if (!geocode) return { error: 'We could not locate that address. Double-check it in Settings.' };
  if (pois.length === 0) return { ok: true, found: 0 };

  const admin = createAdminClient();

  // Skip anything we already have (same name + category) to avoid duplicate staging.
  const { data: existing } = await admin
    .from('recommendations')
    .select('name, category')
    .eq('property_id', propertyId)
    .is('deleted_at', null);
  const have = new Set(
    (existing ?? []).map((r) => `${(r.name ?? '').toLowerCase()}|${r.category ?? ''}`),
  );

  const rows = pois
    .filter((poi: LocalPoi) => !have.has(`${poi.name.toLowerCase()}|${poi.category}`))
    .map((poi: LocalPoi) => ({
      property_id: propertyId,
      name: poi.name,
      category: poi.category,
      address: poi.address,
      url: poi.url,
      distance_note: metersToFriendly(poi.distanceMeters),
      description: `${CATEGORY_LABEL[poi.category] ?? poi.category}${poi.distanceMeters != null ? ` · ${metersToFriendly(poi.distanceMeters)}` : ''}`,
      visibility: 'guest' as const,
      ai_source: poi.aiSource,
      lat: poi.lat,
      lng: poi.lng,
      approved: false, // pending host review
      hidden: false,
      host_preference: 'neutral' as HostPreference,
      priority_weight: 0,
    }));

  if (rows.length > 0) {
    const { error } = await admin.from('recommendations').insert(rows as never);
    if (error) {
      log.warn('local_intel_insert_failed', { error: error.message });
      return { error: 'Found places but could not save them. Try again.' };
    }
  }

  const ctx = await requireSession();
  await audit(createClient(), {
    action: 'recommendations.discovered',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });

  revalidatePath(`/dashboard/properties/${propertyId}/recommendations`);
  return { ok: true, found: rows.length };
}

// ---------------------------------------------------------------------------
// Host curation: approve / set preference / hide / note / priority.
// Any change re-projects the live set into the Brain and bumps brain_version.
// ---------------------------------------------------------------------------
export async function updateRecommendationAction(
  _prev: RecActionState,
  formData: FormData,
): Promise<RecActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const recId = String(formData.get('recId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };
  if (!recId) return { error: 'Missing recommendation.' };

  const patch: Record<string, unknown> = {};
  const pref = formData.get('host_preference');
  if (pref === 'loved' || pref === 'neutral' || pref === 'disliked') patch.host_preference = pref;
  if (formData.has('approved')) patch.approved = formData.get('approved') === 'true';
  if (formData.has('hidden')) patch.hidden = formData.get('hidden') === 'true';
  if (formData.has('host_note')) patch.host_note = String(formData.get('host_note') ?? '').slice(0, 500) || null;
  if (formData.has('priority_weight')) {
    const w = parseInt(String(formData.get('priority_weight') ?? '0'), 10);
    patch.priority_weight = Number.isFinite(w) ? Math.max(-10, Math.min(10, w)) : 0;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from('recommendations')
    .update(patch as never)
    .eq('id', recId)
    .eq('property_id', propertyId);
  if (error) {
    log.warn('rec_update_failed', { error: error.message });
    return { error: 'Could not update that place.' };
  }

  await projectRecommendationsToBrain(propertyId);
  revalidatePath(`/dashboard/properties/${propertyId}/recommendations`);
  return { ok: true };
}

// Host adds their own place (always approved, source=host).
export async function addRecommendationAction(
  _prev: RecActionState,
  formData: FormData,
): Promise<RecActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Add a name.' };
  const category = String(formData.get('category') ?? 'attraction');
  const note = String(formData.get('host_note') ?? '').slice(0, 500) || null;
  const url = String(formData.get('url') ?? '').trim() || null;

  const admin = createAdminClient();
  const { error } = await admin.from('recommendations').insert({
    property_id: propertyId,
    name,
    category,
    url,
    host_note: note,
    description: note ?? name,
    visibility: 'guest',
    ai_source: 'host',
    approved: true,
    hidden: false,
    host_preference: 'loved', // hosts add places they like
    priority_weight: 5,
  } as never);
  if (error) {
    log.warn('rec_add_failed', { error: error.message });
    return { error: 'Could not add that place.' };
  }

  await projectRecommendationsToBrain(propertyId);
  revalidatePath(`/dashboard/properties/${propertyId}/recommendations`);
  return { ok: true };
}

export async function deleteRecommendationAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const recId = String(formData.get('recId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return;
  const admin = createAdminClient();
  await admin
    .from('recommendations')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', recId)
    .eq('property_id', propertyId);
  await projectRecommendationsToBrain(propertyId);
  revalidatePath(`/dashboard/properties/${propertyId}/recommendations`);
}

// ---------------------------------------------------------------------------
// Projection: turn the LIVE recommendation set (approved, not hidden, not
// deleted) into a single guest-visible Brain item so the concierge naturally
// retrieves it. host_preference + priority_weight shape ordering and wording,
// which is how the concierge "respects" host curation without a bespoke path.
// ---------------------------------------------------------------------------
const PROJECTION_TITLE = 'Local recommendations (host-curated)';

export async function projectRecommendationsToBrain(propertyId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: recs } = await admin
    .from('recommendations')
    .select('name, category, address, url, distance_note, host_note, host_preference, priority_weight')
    .eq('property_id', propertyId)
    .is('deleted_at', null)
    .eq('approved', true)
    .eq('hidden', false);

  const live = (recs ?? []) as Array<{
    name: string; category: string | null; address: string | null; url: string | null;
    distance_note: string | null; host_note: string | null;
    host_preference: HostPreference | null; priority_weight: number | null;
  }>;

  // Find any existing projection item so we update-in-place (never pile up dupes).
  const { data: existingItem } = await admin
    .from('brain_items')
    .select('id')
    .eq('property_id', propertyId)
    .eq('title', PROJECTION_TITLE)
    .is('deleted_at', null)
    .maybeSingle();
  const existingId = (existingItem as { id: string } | null)?.id ?? null;

  if (live.length === 0) {
    // Nothing to project — soft-delete the projection item + clear its chunks.
    if (existingId) {
      await admin.from('brain_items')
        .update({ deleted_at: new Date().toISOString(), status: 'stale' } as never)
        .eq('id', existingId);
      await admin.from('document_chunks').delete().eq('brain_item_id', existingId).eq('property_id', propertyId);
      await bumpBrainVersion(admin, propertyId);
    }
    return;
  }

  // Rank: disliked last, loved first, then by priority_weight desc, then name.
  const prefRank: Record<HostPreference, number> = { loved: 0, neutral: 1, disliked: 2 };
  live.sort((a, b) => {
    const pa = prefRank[a.host_preference ?? 'neutral'];
    const pb = prefRank[b.host_preference ?? 'neutral'];
    if (pa !== pb) return pa - pb;
    const wa = a.priority_weight ?? 0;
    const wb = b.priority_weight ?? 0;
    if (wa !== wb) return wb - wa;
    return a.name.localeCompare(b.name);
  });

  const lines: string[] = [];
  for (const r of live) {
    const bits: string[] = [`- ${r.name}`];
    if (r.category) bits.push(`(${CATEGORY_LABEL[r.category] ?? r.category})`);
    if (r.distance_note) bits.push(`— ${r.distance_note}`);
    let line = bits.join(' ');
    if (r.host_preference === 'loved') line += ' — Host favorite.';
    if (r.host_note) line += ` ${r.host_note}`;
    if (r.address) line += ` Address: ${r.address}.`;
    if (r.url) line += ` ${r.url}`;
    lines.push(line);
  }
  const body =
    `These are places near the property, curated by the host. Prefer host favorites when making a suggestion.\n\n` +
    lines.join('\n');

  let itemId = existingId;
  if (itemId) {
    await admin.from('brain_items')
      .update({ body, status: 'ready', updated_at: new Date().toISOString() } as never)
      .eq('id', itemId);
  } else {
    const { data: created, error } = await admin.from('brain_items').insert({
      property_id: propertyId,
      title: PROJECTION_TITLE,
      body,
      category: 'local_recommendations',
      visibility: 'guest',
      source_type: 'manual_entry',
      status: 'ready',
    } as never).select('id').single();
    if (error || !created) {
      log.warn('rec_projection_create_failed', { error: error?.message });
      return;
    }
    itemId = (created as { id: string }).id;
  }

  // Reindex so retrieval picks up the new/updated text (also bumps brain_version).
  await reindexBrainItem(propertyId, itemId, PROJECTION_TITLE, body, 'guest', 'local_recommendations');
}
