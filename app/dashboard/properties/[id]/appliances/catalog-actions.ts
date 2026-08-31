'use server';

// Catalog-driven appliance actions (Manage Brain redesign, slices 4a + 4b).
//
// addFromCatalogAction files a catalog model into the property inventory in one step —
// brand/model/category come from the shared catalog, never retyped, which is what makes
// the added appliance matchable for the knowledge pipeline. pullCatalogKnowledgeAction
// is the 4b half: shared knowledge copies into the property as unapproved review
// sections, fetching the manufacturer source once per model when the catalog is empty.
// Host approval remains the final gate before anything reaches the Brain.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeApplianceKey } from '@/lib/appliances/catalog';
import { publishApprovedSectionToCatalog } from '@/lib/appliances/publish';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { segmentApplianceManual, requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
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

const pullSchema = z.object({
  propertyId: z.string().uuid(),
  applianceId: z.string().uuid(),
});

/**
 * Copy shared catalog knowledge into the property as UNAPPROVED manual sections — the
 * existing review card and approval action stay the final gate. When the catalog has
 * nothing yet but a manufacturer source is on file, fetch + segment it once (per model,
 * not per property), then copy down. Skips titles already in the property's list.
 */
export async function pullCatalogKnowledgeAction(
  _prev: ApplianceFormState,
  formData: FormData,
): Promise<ApplianceFormState> {
  const parsed = pullSchema.safeParse({
    propertyId: formData.get('propertyId'),
    applianceId: formData.get('applianceId'),
  });
  if (!parsed.success) return { error: 'Invalid appliance.' };
  const { propertyId, applianceId } = parsed.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };

  const client = createClient();
  const { data: appliance } = await client
    .from('property_appliances')
    .select('id, catalog_id')
    .eq('id', applianceId)
    .eq('property_id', propertyId)
    .maybeSingle();
  if (!appliance?.catalog_id) return { error: 'This appliance is not linked to the catalog.' };

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from('appliance_catalog')
    .select('id, brand, model, oem_support_url')
    .eq('id', appliance.catalog_id)
    .maybeSingle();
  if (!entry) return { error: 'That catalog entry no longer exists.' };

  let { count } = await admin
    .from('appliance_catalog_knowledge')
    .select('id', { count: 'exact', head: true })
    .eq('catalog_id', entry.id);

  if ((count ?? 0) === 0 && entry.oem_support_url) {
    try {
      const page = await fetchUrlContent(entry.oem_support_url);
      const sections = segmentApplianceManual(page.text, page.sourceUrl);
      for (const s of sections) {
        await publishApprovedSectionToCatalog(admin, {
          catalogId: entry.id,
          brand: entry.brand,
          sectionTitle: s.sectionTitle,
          body: s.body,
          pageRef: s.pageRef,
        });
      }
      count = sections.length;
    } catch (e) {
      log.warn('catalog_oem_fetch_failed', { catalogId: entry.id, error: String(e) });
      if (isSsrfError(e)) return { error: 'That manufacturer URL is not safe to fetch.' };
      // Fall through to the empty message below.
    }
  }

  if ((count ?? 0) === 0) {
    return {
      error: 'No shared knowledge for this model yet — import its manual below once and it will teach the catalog.',
    };
  }

  const { data: existing } = await client
    .from('appliance_manual_sections')
    .select('section_title')
    .eq('appliance_id', appliance.id)
    .eq('property_id', propertyId);
  const have = new Set((existing ?? []).map((r) => r.section_title));

  const { data: rows } = await admin
    .from('appliance_catalog_knowledge')
    .select('kind, question, answer, source_url')
    .eq('catalog_id', entry.id)
    .order('created_at', { ascending: true })
    .limit(40);
  const fresh = (rows ?? []).filter((r) => !have.has(r.question));
  if (fresh.length === 0) {
    return { success: 'Everything the catalog has for this model is already in your review list.' };
  }

  // The safety boundary is recomputed at copy-down: catalog rows are shared, the
  // licensed-technician flag is per-section and deterministic.
  const { error: insertError } = await admin.from('appliance_manual_sections').insert(
    fresh.map((r) => ({
      property_id: propertyId,
      appliance_id: appliance.id,
      section_title: r.question,
      body: r.answer,
      page_ref: r.source_url,
      requires_licensed_technician: requiresLicensedTechnician(`${r.question}\n${r.answer}`),
    })),
  );
  if (insertError) return { error: 'Could not stage the catalog knowledge for review.' };

  revalidatePath(`/dashboard/properties/${propertyId}/appliances`);
  return { success: `${fresh.length} section${fresh.length === 1 ? '' : 's'} ready to review below.` };
}
