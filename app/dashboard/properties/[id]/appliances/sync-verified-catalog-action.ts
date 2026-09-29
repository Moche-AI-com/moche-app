'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { stageCatalogKnowledgeForAppliance } from '@/lib/appliances/stage-catalog-knowledge';
import type { ApplianceFormState } from './actions';

/** Refresh only previously verified catalog material; never crawl or publish. */
export async function syncVerifiedCatalogAction(_prev: ApplianceFormState, formData: FormData): Promise<ApplianceFormState> {
  const ids = z.object({ propertyId: z.string().uuid(), applianceId: z.string().uuid() }).safeParse({
    propertyId: formData.get('propertyId'), applianceId: formData.get('applianceId'),
  });
  if (!ids.success) return { error: 'Choose a valid appliance.' };
  const access = await requirePropertyAccess(ids.data.propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit this appliance.' };
  const { data: appliance } = await createClient().from('property_appliances').select('catalog_id')
    .eq('property_id', ids.data.propertyId).eq('id', ids.data.applianceId).maybeSingle();
  if (!appliance?.catalog_id) return { error: 'This appliance is not linked to the catalog.' };
  const result = await stageCatalogKnowledgeForAppliance({
    propertyId: ids.data.propertyId, applianceId: ids.data.applianceId, catalogId: appliance.catalog_id,
  });
  revalidatePath(`/dashboard/properties/${ids.data.propertyId}/appliances`);
  if (result.error) return { error: result.error };
  if (!result.manualSections && !result.answerDrafts) return { success: 'No new verified material for this exact model. Try finding a manufacturer manual.' };
  return { success: `${result.manualSections} source section(s) and ${result.answerDrafts} question draft(s) prepared for host review.` };
}
