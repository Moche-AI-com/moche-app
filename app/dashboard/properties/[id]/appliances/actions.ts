'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchUrlContent, isSsrfError } from '@/lib/ingest/firecrawl';
import { segmentApplianceManual } from '@/lib/property-import/appliance-safety';
import { createProposal } from '@/lib/brain/proposal-store';
import { applyProposal } from '@/lib/brain/apply-proposal';
import { publishApprovedSectionToCatalog } from '@/lib/appliances/publish';

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

export async function addApplianceAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const parsed = values(formData); if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the appliance details.' };
  const access = await requirePropertyAccess(parsed.data.propertyId); if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };
  if (!parsed.data.modelNumber && !parsed.data.unknownModel) return { error: 'Enter the exact model number, or mark it as unknown.' };
  const ctx = await getSessionContext(); const client = createClient();
  const { error } = await client.from('property_appliances').insert({ property_id: parsed.data.propertyId, category: parsed.data.category, display_name: parsed.data.displayName, brand: parsed.data.brand || null, model_number: parsed.data.unknownModel ? null : parsed.data.modelNumber || null, serial_number: parsed.data.serialNumber || null, location_note: parsed.data.locationNote || null, verification_status: parsed.data.unknownModel ? 'unverified' : 'model_confirmed', created_by: ctx?.user.id ?? null });
  if (error) return { error: 'Could not save this appliance. Check that category and model are not duplicates.' };
  revalidatePath(`/dashboard/properties/${parsed.data.propertyId}/appliances`); return { success: 'Appliance added.' };
}

export async function updateApplianceAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const parsed = values(formData); const applianceId = z.string().uuid().safeParse(formData.get('applianceId'));
  if (!parsed.success || !applianceId.success) return { error: 'Check the appliance details.' };
  const access = await requirePropertyAccess(parsed.data.propertyId); if (!access.can.editProperty) return { error: 'You cannot edit appliances for this property.' };
  if (!parsed.data.modelNumber && !parsed.data.unknownModel) return { error: 'Enter the exact model number, or mark it as unknown.' };
  const client = createClient();
  const { error } = await client.from('property_appliances').update({ category: parsed.data.category, display_name: parsed.data.displayName, brand: parsed.data.brand || null, model_number: parsed.data.unknownModel ? null : parsed.data.modelNumber || null, serial_number: parsed.data.serialNumber || null, location_note: parsed.data.locationNote || null, verification_status: parsed.data.unknownModel ? 'unverified' : 'model_confirmed', manual_url: null, manual_document_id: null, updated_at: new Date().toISOString() }).eq('id', applianceId.data).eq('property_id', parsed.data.propertyId);
  if (error) return { error: 'Could not update this appliance.' };
  revalidatePath(`/dashboard/properties/${parsed.data.propertyId}/appliances`); return { success: 'Appliance updated. Confirm its manual again if the model changed.' };
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
  revalidatePath(`/dashboard/properties/${propertyId.data}/appliances`); return { success: 'Manual sections are ready for your approval.' };
}

export async function approveManualSectionAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const propertyId = z.string().uuid().safeParse(formData.get('propertyId')); const sectionId = z.string().uuid().safeParse(formData.get('sectionId'));
  if (!propertyId.success || !sectionId.success) return { error: 'Invalid manual section.' };
  const access = await requirePropertyAccess(propertyId.data); if (!access.can.editBrain) return { error: 'You cannot add this manual section to the Brain.' };
  const client = createClient(); const { data: section } = await client.from('appliance_manual_sections').select('id, appliance_id, section_title, body, page_ref, approved_at').eq('id', sectionId.data).eq('property_id', propertyId.data).maybeSingle();
  if (!section || section.approved_at) return { error: 'This manual section is no longer available for approval.' };
  const ctx = await getSessionContext(); if (!ctx) return { error: 'Sign in again to approve this section.' };
  const admin = createAdminClient();
  const proposal = await createProposal(admin, { propertyId: propertyId.data, hostAccountId: access.property.host_account_id, fieldPath: 'brain.listing_summary', label: section.section_title, proposedValue: { title: section.section_title, text: section.body, category: 'appliances', visibility: 'guest', sourceUrl: section.page_ref }, sourceType: 'document', sourceRef: section.page_ref, confidence: null });
  if (!proposal.ok) return { error: proposal.error };
  const applied = await applyProposal(admin, { propertyId: propertyId.data, fieldPath: 'brain.listing_summary', value: { title: section.section_title, text: section.body, category: 'appliances', visibility: 'guest', sourceUrl: section.page_ref }, actorProfileId: ctx.user.id, sourceRef: section.page_ref });
  if (!applied.ok) return { error: applied.error };
  const now = new Date().toISOString();
  await admin.from('proposed_updates').update({ status: 'approved', reviewed_at: now, reviewed_by: ctx.user.id, applied_at: now, applied_value: { title: section.section_title, text: section.body } }).eq('id', proposal.id);
  const { error } = await client.from('appliance_manual_sections').update({ approved_at: now, approved_by: ctx.user.id }).eq('id', section.id).eq('property_id', propertyId.data);
  if (error) return { error: 'The section was added to the Brain but approval could not be recorded.' };
  const { error: readinessError } = await admin.from('property_knowledge_requirement_status').upsert({
    property_id: propertyId.data, requirement_key: 'appliance_guidance', requirement_version: 1,
    status: 'satisfied', satisfied_at: now, evidence: { source: 'approved_appliance_manual_section', section_id: section.id }, updated_at: now,
  }, { onConflict: 'property_id,requirement_key' });
  if (readinessError) return { error: 'The section was approved, but appliance readiness could not be updated.' };
  // Teach the shared catalog (slice 4b): an approved, manual-sourced section on a
  // catalog-linked appliance becomes reusable knowledge for every future property with
  // the same model. Runs after the approval succeeded; a catalog hiccup never fails it.
  const { data: applianceRow } = await admin
    .from('property_appliances')
    .select('catalog_id, brand')
    .eq('id', section.appliance_id)
    .eq('property_id', propertyId.data)
    .maybeSingle();
  if (applianceRow?.catalog_id) {
    await publishApprovedSectionToCatalog(admin, {
      catalogId: applianceRow.catalog_id,
      brand: applianceRow.brand ?? '',
      sectionTitle: section.section_title,
      body: section.body,
      pageRef: section.page_ref,
    });
  }
  revalidatePath(`/dashboard/properties/${propertyId.data}/appliances`); return { success: 'Manual section added to the Brain.' };
}
