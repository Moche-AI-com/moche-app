'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { redactCredentials } from '@/lib/brain/redact';
import { requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';

export interface AdoptPrefillState { error?: string; success?: string }

/** Hosts edit the AI candidate, then save it as an unapproved draft. */
export async function adoptApplianceDraftAction(
  _prev: AdoptPrefillState, formData: FormData,
): Promise<AdoptPrefillState> {
  const parsed = z.object({
    propertyId: z.string().uuid(), applianceId: z.string().uuid(),
    expectedModel: z.string().trim().min(1).max(160),
    guestGuidance: z.string().trim().min(1).max(4000),
  }).safeParse({
    propertyId: formData.get('propertyId'), applianceId: formData.get('applianceId'),
    expectedModel: formData.get('expectedModel'), guestGuidance: formData.get('guestGuidance'),
  });
  if (!parsed.success) return { error: 'Choose an exact model and enter guest guidance under 4,000 characters.' };
  const { propertyId, applianceId, expectedModel, guestGuidance } = parsed.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit this appliance.' };
  if (redactCredentials(guestGuidance).redactions.length || requiresLicensedTechnician(guestGuidance)) {
    return { error: 'Remove credentials and technician-only instructions. Nothing was saved.' };
  }
  const db = createClient() as any;
  const { data, error } = await db.from('property_appliances')
    .update({ guest_guidance: guestGuidance, guidance_approved_at: null, guidance_approved_by: null, updated_at: new Date().toISOString() })
    .eq('id', applianceId).eq('property_id', propertyId).eq('model_number', expectedModel)
    .select('id').maybeSingle();
  if (error || !data) return { error: 'This appliance changed or could not be saved. Refresh before trying again.' };
  await audit(createClient(), { action: 'appliance.ai_draft_saved', propertyId, targetType: 'property_appliances', targetId: applianceId });
  revalidatePath(`/dashboard/properties/${propertyId}/appliances`);
  return { success: 'Draft saved. Review it on the appliance card and approve it separately before guests can use it.' };
}
