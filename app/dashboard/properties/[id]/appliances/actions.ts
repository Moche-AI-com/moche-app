'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { segmentApplianceManual } from '@/lib/property-import/appliance-safety';
import { publishApprovedSectionToCatalog } from '@/lib/appliances/publish';
import { audit } from '@/lib/audit';

export interface ApplianceFormState { error?: string; success?: string }

const applianceSchema = z.object({
  propertyId: z.string().uuid(), category: z.string().trim().min(1).max(80), displayName: z.string().trim().min(1).max(160),
  brand: z.string().trim().max(120).optional().or(z.literal('')), modelNumber: z.string().trim().max(160).optional().or(z.literal('')),
  serialNumber: z.string().trim().max(160).optional().or(z.literal('')), locationNote: z.string().trim().max(300).optional().or(z.literal('')),
  unknownModel: z.boolean().optional(),
});

function values(formData: FormData) {
  return applianceSchema.safeParse({ propertyId: formData.get('propertyId'), category: formData.get('category'), displayName: formData.get('displayName'), brand: formData.get('brand') || '', modelNumber: formData.get('modelNumber') || '', serialNumber: formData.get('serialNumber') || '', locationNote: formData.get('locationNote') || '', unknownModel: formData.get('unknownModel') === 'on' });
}

function refresh(propertyId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}/appliances`);
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
}

export async function addApplianceAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const parsed = values(formData); if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the appliance details.' };
  const access = await requirePropertyAccess(parsed.data.propertyId); if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };
  if (!parsed.data.modelNumber && !parsed.data.unknownModel) return { error: 'Enter the exact model number, or mark it as unknown.' };
  const ctx = await getSessionContext(); const client = createClient();
  const { error } = await client.from('property_appliances').insert({ property_id: parsed.data.propertyId, category: parsed.data.category, display_name: parsed.data.displayName, brand: parsed.data.brand || null, model_number: parsed.data.unknownModel ? null : parsed.data.modelNumber || null, serial_number: parsed.data.serialNumber || null, location_note: parsed.data.locationNote || null, verification_status: parsed.data.unknownModel ? 'unverified' : 'model_confirmed', created_by: ctx?.user.id ?? null, guest_visible: false } as never);
  if (error) return { error: 'Could not save this appliance. Check that category and model are not duplicates.' };
  refresh(parsed.data.propertyId); return { success: 'Appliance added. Make it guest-visible after reviewing its details.' };
}

export async function updateApplianceAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const parsed = values(formData); const applianceId = z.string().uuid().safeParse(formData.get('applianceId'));
  if (!parsed.success || !applianceId.success) return { error: 'Check the appliance details.' };
  const access = await requirePropertyAccess(parsed.data.propertyId); if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };
  if (!parsed.data.modelNumber && !parsed.data.unknownModel) return { error: 'Enter the exact model number, or mark it as unknown.' };
  const client = createClient();
  const { data: current, error: readError } = await client.from('property_appliances')
    .select('id, model_number, catalog_id, manual_url, manual_document_id, verification_status')
    .eq('id', applianceId.data).eq('property_id', parsed.data.propertyId).maybeSingle();
  if (readError || !current) return { error: 'This appliance could not be found.' };
  const nextModel = parsed.data.unknownModel ? null : parsed.data.modelNumber || null;
  const modelChanged = nextModel !== current.model_number;
  const { data, error } = await client.from('property_appliances').update({
    category: parsed.data.category, display_name: parsed.data.displayName, brand: parsed.data.brand || null,
    model_number: nextModel, serial_number: parsed.data.serialNumber || null, location_note: parsed.data.locationNote || null,
    verification_status: modelChanged ? (nextModel ? 'model_confirmed' : 'unverified') : current.verification_status,
    ...(modelChanged ? { manual_url: null, manual_document_id: null, catalog_id: null } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', applianceId.data).eq('property_id', parsed.data.propertyId).select('id').maybeSingle();
  if (error || !data) return { error: 'Could not update this appliance.' };
  // New device-specific guidance and answers are revoked by the database trigger.
  // Old manual sections remain as historical source text, but cannot be reused
  // after the manual URL and catalog link have been cleared.
  refresh(parsed.data.propertyId);
  return { success: modelChanged ? 'Model changed. Review guidance and confirm a matching manual again.' : 'Appliance saved.' };
}

export async function ingestManualAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const propertyId = z.string().uuid().safeParse(formData.get('propertyId')); const applianceId = z.string().uuid().safeParse(formData.get('applianceId')); const manualUrl = z.string().url().max(2000).safeParse(formData.get('manualUrl'));
  if (!propertyId.success || !applianceId.success || !manualUrl.success) return { error: 'Enter a valid manual URL.' };
  if (formData.get('manualConfirmed') !== 'on') return { error: 'Confirm that this manual matches the exact model before importing it.' };
  const access = await requirePropertyAccess(propertyId.data); if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };
  const client = createClient(); const { data: appliance } = await client.from('property_appliances').select('id, model_number').eq('id', applianceId.data).eq('property_id', propertyId.data).maybeSingle();
  if (!appliance?.model_number) return { error: 'Add and confirm the exact model number before importing a manual.' };
  try {
    const page = await fetchUrlContent(manualUrl.data); const sections = segmentApplianceManual(page.text, page.sourceUrl);
    if (sections.length === 0) return { error: 'No usable manual sections were found at that URL.' };
    const admin = createAdminClient();
    const { error: sectionError } = await admin.from('appliance_manual_sections').insert(sections.map((section) => ({ property_id: propertyId.data, appliance_id: applianceId.data, section_title: section.sectionTitle, body: section.body, page_ref: section.pageRef, requires_licensed_technician: section.requiresLicensedTechnician })));
    if (sectionError) return { error: 'Could not save the manual sections.' };
    const { error: applianceError } = await client.from('property_appliances').update({ manual_url: page.sourceUrl, verification_status: 'manual_ingested', last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', applianceId.data).eq('property_id', propertyId.data);
    if (applianceError) return { error: 'Manual was read but appliance verification could not be updated.' };
  } catch (error) { return { error: isSsrfError(error) ? 'That manual URL is not safe to fetch.' : 'Could not read that manual URL.' }; }
  refresh(propertyId.data); return { success: 'Manual sections are ready for source review.' };
}

export async function approveManualSectionAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const propertyId = z.string().uuid().safeParse(formData.get('propertyId')); const sectionId = z.string().uuid().safeParse(formData.get('sectionId'));
  if (!propertyId.success || !sectionId.success) return { error: 'Invalid manual section.' };
  const access = await requirePropertyAccess(propertyId.data); if (!access.can.editProperty) return { error: 'You cannot verify manual sources for this property.' };
  const client = createClient();
  const { data: section } = await client.from('appliance_manual_sections')
    .select('id, appliance_id, section_title, body, page_ref, approved_at, requires_licensed_technician')
    .eq('id', sectionId.data).eq('property_id', propertyId.data).maybeSingle();
  if (!section || section.approved_at) return { error: 'This manual section is no longer available for review.' };
  if (section.requires_licensed_technician) return { error: 'Technician-only content cannot become guest guidance.' };
  const { data: appliance } = await client.from('property_appliances')
    .select('catalog_id, brand, manual_url, model_number').eq('id', section.appliance_id)
    .eq('property_id', propertyId.data).maybeSingle();
  if (!appliance?.model_number) return { error: 'Confirm this appliance model first.' };
  const matchingManual = !!appliance.manual_url && section.page_ref === appliance.manual_url;
  let matchingCatalog = false;
  if (appliance.catalog_id) {
    const { data: catalog } = await createAdminClient().from('appliance_catalog')
      .select('model').eq('id', appliance.catalog_id).maybeSingle();
    matchingCatalog = !!catalog && catalog.model.replace(/\s+/g, '').toLowerCase()
      === appliance.model_number.replace(/\s+/g, '').toLowerCase();
  }
  if (!matchingManual && !matchingCatalog) return { error: 'The manual source no longer matches this model. Confirm a new source.' };
  const ctx = await getSessionContext(); if (!ctx) return { error: 'Sign in again to verify this source.' };
  const now = new Date().toISOString();
  const { data: verified, error } = await client.from('appliance_manual_sections')
    .update({ approved_at: now, approved_by: ctx.user.id }).eq('id', section.id)
    .eq('property_id', propertyId.data).is('approved_at', null).select('id').maybeSingle();
  if (error || !verified) return { error: 'Could not verify this manual source.' };
  // Review verifies source evidence; it does NOT create a generic Brain item.
  // The host must separately edit and approve appliance-specific answers.
  if (appliance.catalog_id) {
    await publishApprovedSectionToCatalog(createAdminClient(), {
      catalogId: appliance.catalog_id, brand: appliance.brand ?? '',
      sectionTitle: section.section_title, body: section.body, pageRef: section.page_ref,
    });
  }
  await audit(client, { action: 'appliance.manual_source_verified', propertyId: propertyId.data, targetType: 'appliance_manual_sections', targetId: section.id });
  refresh(propertyId.data);
  return { success: 'Source verified. Prepare and approve guest guidance separately before guests see it.' };
}
