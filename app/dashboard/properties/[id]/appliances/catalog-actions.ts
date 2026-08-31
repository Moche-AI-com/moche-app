'use server';

// Catalog-driven appliance actions (Manage Brain redesign, slice 4a).
//
// addFromCatalogAction files a catalog model into the property inventory in one step —
// brand/model/category come from the shared catalog, never retyped, which is what makes
// the added appliance matchable for the 4b knowledge pipeline. Manual entry stays in
// actions.ts; unknown models submit as candidates so the catalog learns from hosts.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeApplianceKey } from '@/lib/appliances/catalog';
import { audit } from '@/lib/audit';
import type { ApplianceFormState } from './actions';

const addFromCatalogSchema = z.object({
  propertyId: z.string().uuid(),
  catalogId: z.string().uuid(),
  displayName: z.string().trim().max(160).optional().or(z.literal('')),
  locationNote: z.string().trim().max(300).optional().or(z.literal('')),
});

export async function addFromCatalogAction(
  _prev: ApplianceFormState,
  formData: FormData,
): Promise<ApplianceFormState> {
  const parsed = addFromCatalogSchema.safeParse({
    propertyId: formData.get('propertyId'),
    catalogId: formData.get('catalogId'),
    displayName: formData.get('displayName') || '',
    locationNote: formData.get('locationNote') || '',
  });
  if (!parsed.success) return { error: 'Check the appliance details.' };
  const access = await requirePropertyAccess(parsed.data.propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };

  const client = createClient();
  const { data: entry } = await client
    .from('appliance_catalog')
    .select('id, category, brand, model, times_added')
    .eq('id', parsed.data.catalogId)
    .maybeSingle();
  if (!entry) return { error: 'That catalog entry no longer exists.' };

  const ctx = await getSessionContext();
  const { error } = await client.from('property_appliances').insert({
    property_id: parsed.data.propertyId,
    category: entry.category,
    display_name: parsed.data.displayName || `${entry.brand} ${entry.model}`,
    brand: entry.brand,
    model_number: entry.model,
    location_note: parsed.data.locationNote || null,
    verification_status: 'model_confirmed',
    catalog_id: entry.id,
    created_by: ctx?.user.id ?? null,
  });
  if (error) return { error: 'Could not save this appliance — it may already be in your inventory.' };

  // Popularity feeds search ranking. Catalog writes are service-role only by design;
  // best-effort, never worth failing the add.
  const admin = createAdminClient();
  await admin
    .from('appliance_catalog')
    .update({ times_added: entry.times_added + 1, updated_at: new Date().toISOString() })
    .eq('id', entry.id);

  await audit(client, {
    action: 'appliance.added_from_catalog',
    actorProfileId: ctx?.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: parsed.data.propertyId,
    targetType: 'appliance_catalog',
    targetId: entry.id,
  });
  revalidatePath(`/dashboard/properties/${parsed.data.propertyId}/appliances`);
  return { success: `${entry.brand} ${entry.model} added to your inventory.` };
}

const candidateSchema = z.object({
  propertyId: z.string().uuid(),
  rawCategory: z.string().trim().min(1).max(80),
  rawBrand: z.string().trim().max(120).optional().or(z.literal('')),
  rawModel: z.string().trim().min(1).max(160),
});

export async function submitCatalogCandidateAction(
  _prev: ApplianceFormState,
  formData: FormData,
): Promise<ApplianceFormState> {
  const parsed = candidateSchema.safeParse({
    propertyId: formData.get('propertyId'),
    rawCategory: formData.get('rawCategory'),
    rawBrand: formData.get('rawBrand') || '',
    rawModel: formData.get('rawModel'),
  });
  if (!parsed.success) return { error: 'Tell us the model you were looking for.' };
  const access = await requirePropertyAccess(parsed.data.propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };
  const ctx = await getSessionContext();
  if (!ctx) return { error: 'Sign in again to submit this.' };

  const key = normalizeApplianceKey(parsed.data.rawBrand, parsed.data.rawModel);
  const client = createClient();
  const { error } = await client.from('appliance_catalog_candidates').insert({
    raw_category: parsed.data.rawCategory,
    raw_brand: parsed.data.rawBrand || null,
    raw_model: parsed.data.rawModel,
    normalized_key: key,
    submitted_by: ctx.user.id,
  });
  if (error) {
    // Already submitted: bump the count. Candidates have no host update policy (service
    // role writes only), so the increment goes through the admin client after the guard.
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('appliance_catalog_candidates')
      .select('id, submit_count')
      .eq('normalized_key', key)
      .maybeSingle();
    if (existing) {
      await admin
        .from('appliance_catalog_candidates')
        .update({ submit_count: existing.submit_count + 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
  }
  return { success: 'Noted — we will review it for the catalog. You can still add it manually below.' };
}
