'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { redactCredentials } from '@/lib/brain/redact';
import { requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';

export interface SourcedAnswerState { error?: string; success?: string }

/** Never trust a client-supplied source token: verify it belongs to this device. */
export async function saveSourcedApplianceAnswerAction(
  _prev: SourcedAnswerState, formData: FormData,
): Promise<SourcedAnswerState> {
  const parsed = z.object({
    propertyId: z.string().uuid(), applianceId: z.string().uuid(),
    expectedModel: z.string().trim().min(1).max(160),
    question: z.string().trim().min(1).max(300),
    answer: z.string().trim().min(1).max(4000),
    sourceRef: z.string().regex(/^(?:catalog|manual):[0-9a-f-]{36}$/i),
  }).safeParse({
    propertyId: formData.get('propertyId'), applianceId: formData.get('applianceId'),
    expectedModel: formData.get('expectedModel'),
    question: formData.get('question'), answer: formData.get('answer'),
    sourceRef: formData.get('sourceRef'),
  });
  if (!parsed.success) return { error: 'Review the question, answer, model and source before saving.' };
  const { propertyId, applianceId, expectedModel, question, answer, sourceRef } = parsed.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit this appliance.' };
  if (redactCredentials(`${question}\n${answer}`).redactions.length
    || requiresLicensedTechnician(`${question}\n${answer}`)) {
    return { error: 'Remove credentials and technician-only instructions. Nothing was saved.' };
  }
  const client = createClient() as any;
  const { data: appliance, error } = await client.from('property_appliances')
    .select('id, model_number, catalog_id, manual_url')
    .eq('id', applianceId).eq('property_id', propertyId).maybeSingle();
  if (error || !appliance || appliance.model_number !== expectedModel) {
    return { error: 'The appliance model has changed. Prepare a new suggestion for the current model.' };
  }

  const [kind, sourceId] = sourceRef.split(':');
  let validSource = false;
  if (kind === 'manual' && appliance.manual_url) {
    const { data: section } = await client.from('appliance_manual_sections')
      .select('id, page_ref, requires_licensed_technician')
      .eq('id', sourceId).eq('property_id', propertyId).eq('appliance_id', applianceId)
      .not('approved_at', 'is', null).maybeSingle();
    validSource = !!section && !section.requires_licensed_technician && section.page_ref === appliance.manual_url;
  } else if (kind === 'catalog' && appliance.catalog_id) {
    const admin = createAdminClient() as any;
    const { data: catalog } = await admin.from('appliance_catalog')
      .select('model').eq('id', appliance.catalog_id).maybeSingle();
    if (catalog?.model.replace(/\s+/g, '').toLowerCase() === expectedModel.replace(/\s+/g, '').toLowerCase()) {
      const { data: knowledge } = await admin.from('appliance_catalog_knowledge')
        .select('id').eq('id', sourceId).eq('catalog_id', appliance.catalog_id).maybeSingle();
      validSource = !!knowledge;
    }
  }
  if (!validSource) return { error: 'The source is no longer valid for this appliance. No draft was saved.' };
  const actor = await getSessionContext();
  if (!actor) return { error: 'Sign in again before saving.' };
  const { data: saved, error: saveError } = await client.from('appliance_answers').insert({
    property_id: propertyId, appliance_id: applianceId, question, answer,
    source_kind: 'ai_draft', source_ref: sourceRef, model_number_snapshot: appliance.model_number,
    status: 'draft', created_by: actor.user.id,
  }).select('id').maybeSingle();
  if (saveError || !saved) return { error: 'Could not save that draft. Please retry.' };
  await audit(createClient(), { action: 'appliance.sourced_answer_drafted', propertyId, targetType: 'appliance_answers', targetId: saved.id, metadata: { source_ref: sourceRef } });
  revalidatePath(`/dashboard/properties/${propertyId}/appliances`);
  return { success: 'Saved for review. Approve this answer on the appliance card before guests can use it.' };
}
