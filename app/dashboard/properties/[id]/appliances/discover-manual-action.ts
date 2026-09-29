'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { acquire } from '@/lib/acquisition';
import { isSsrfError } from '@/lib/ingest/firecrawl';
import { redactCredentials } from '@/lib/brain/redact';
import { hasExactModelManualEvidence } from '@/lib/appliances/manual-evidence';
import { segmentApplianceManual } from '@/lib/property-import/appliance-safety';
import type { ApplianceFormState } from './actions';

const modelKey = (text: string) => text.replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Fetch a catalog-linked candidate; never call it a verified manual or publish it. */
export async function discoverOemManualAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const ids = z.object({ propertyId: z.string().uuid(), applianceId: z.string().uuid() }).safeParse({
    propertyId: formData.get('propertyId'), applianceId: formData.get('applianceId'),
  });
  if (!ids.success) return { error: 'Choose a valid appliance.' };
  const { propertyId, applianceId } = ids.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot find a manual for this property.' };
  const db = createClient();
  const { data: appliance } = await db.from('property_appliances').select('catalog_id, model_number')
    .eq('property_id', propertyId).eq('id', applianceId).maybeSingle();
  if (!appliance?.catalog_id || !appliance.model_number) return { error: 'Confirm an exact catalog model first.' };
  const admin = createAdminClient();
  const { data: catalog } = await admin.from('appliance_catalog').select('model, oem_support_url')
    .eq('id', appliance.catalog_id).maybeSingle();
  if (!catalog || modelKey(catalog.model) !== modelKey(appliance.model_number) || !catalog.oem_support_url?.startsWith('https://'))
    return { error: 'No matching manufacturer source is available. Use the manual URL fallback.' };
  try {
    const page = await acquire(catalog.oem_support_url, 'manual_site_v1');
    if (!hasExactModelManualEvidence({ model: appliance.model_number, title: page.title, text: page.text, url: page.finalUrl }))
      return { error: 'The manufacturer page did not establish an exact-model manual. Use the manual URL fallback.' };
    const { data: existing, error: existingError } = await db.from('appliance_manual_sections').select('section_title')
      .eq('property_id', propertyId).eq('appliance_id', applianceId);
    if (existingError) return { error: 'Could not check existing manual excerpts.' };
    const seen = new Set((existing ?? []).map((row) => row.section_title.trim().toLowerCase()));
    const sections = segmentApplianceManual(page.text, page.finalUrl).slice(0, 12)
      .filter((section) => !seen.has(section.sectionTitle.trim().toLowerCase())
        && !redactCredentials(`${section.sectionTitle}\n${section.body}`).redactions.length);
    if (!sections.length) return { error: 'No new safe manual excerpts were found. Use the manual URL fallback.' };
    const { error } = await admin.from('appliance_manual_sections').insert(sections.map((section) => ({
      property_id: propertyId, appliance_id: applianceId, section_title: section.sectionTitle,
      body: section.body, page_ref: page.finalUrl, requires_licensed_technician: section.requiresLicensedTechnician,
    })));
    if (error) return { error: 'Could not prepare manufacturer excerpts for review.' };
    revalidatePath(`/dashboard/properties/${propertyId}/appliances`);
    return { success: `${sections.length} manufacturer-source excerpt(s) staged for review. Verify the exact manual before approving any guest guidance.` };
  } catch (error) {
    return { error: isSsrfError(error) ? 'The manufacturer URL is not safe to fetch.' : 'Could not read a matching manufacturer manual. Use the manual URL fallback.' };
  }
}
