'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { stageCatalogKnowledgeForAppliance } from '@/lib/appliances/stage-catalog-knowledge';
import { addFromCatalogAction } from './catalog-actions';
import type { ApplianceFormState } from './actions';

/** One host add, followed by best-effort staging of existing verified model material. */
export async function addFromCatalogWithKnowledgeAction(
  previous: ApplianceFormState, formData: FormData,
): Promise<ApplianceFormState> {
  const parsed = z.object({ propertyId: z.string().uuid(), catalogId: z.string().uuid() }).safeParse({
    propertyId: formData.get('propertyId'), catalogId: formData.get('catalogId'),
  });
  if (!parsed.success) return { error: 'Choose a valid catalog appliance.' };
  const access = await requirePropertyAccess(parsed.data.propertyId);
  if (!access.can.editProperty) return { error: 'You cannot add an appliance to this property.' };

  const added = await addFromCatalogAction(previous, formData);
  if (!added.success) return added;
  const client = createClient();
  const { data: appliance, error } = await client.from('property_appliances')
    .select('id').eq('property_id', parsed.data.propertyId).eq('catalog_id', parsed.data.catalogId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !appliance) return { success: `${added.success} Source review could not start; the appliance remains usable for guest questions.` };

  const staged = await stageCatalogKnowledgeForAppliance({
    propertyId: parsed.data.propertyId, applianceId: appliance.id, catalogId: parsed.data.catalogId,
  });
  revalidatePath(`/dashboard/properties/${parsed.data.propertyId}/appliances`);
  if (staged.error) return { success: `${added.success} Source suggestions could not be staged; check the manual fallback.` };
  if (!staged.manualSections && !staged.answerDrafts)
    return { success: `${added.success} No verified catalog material is available yet; guests can still ask about this appliance.` };
  return { success: `${added.success} ${staged.manualSections} source section(s) and ${staged.answerDrafts} common answer draft(s) are ready for your review.` };
}
