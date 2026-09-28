'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import { redactCredentials } from '@/lib/brain/redact';
import { requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';

export interface GuidanceActionState { error?: string; success?: string }

const idsSchema = z.object({ propertyId: z.string().uuid(), applianceId: z.string().uuid() });

function parseIds(formData: FormData) {
  return idsSchema.safeParse({ propertyId: formData.get('propertyId'), applianceId: formData.get('applianceId') });
}

function unsafe(text: string) {
  return redactCredentials(text).redactions.length > 0 || requiresLicensedTechnician(text);
}

function refresh(propertyId: string) {
  revalidatePath(`/dashboard/properties/${propertyId}/appliances`);
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
}

export async function saveApplianceGuidanceAction(
  _prev: GuidanceActionState, formData: FormData,
): Promise<GuidanceActionState> {
  const ids = parseIds(formData);
  if (!ids.success) return { error: 'Choose a valid appliance.' };
  const { propertyId, applianceId } = ids.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot edit this appliance.' };
  const parsed = z.object({
    guestGuidance: z.string().trim().max(4000),
    privateNotes: z.string().trim().max(4000),
  }).safeParse({ guestGuidance: formData.get('guestGuidance') ?? '', privateNotes: formData.get('privateNotes') ?? '' });
  if (!parsed.success) return { error: 'Keep each note under 4,000 characters.' };
  if (unsafe(parsed.data.guestGuidance) || redactCredentials(parsed.data.privateNotes).redactions.length) {
    return { error: 'Remove credentials and technician-only instructions before saving. Keep host-private notes free of secrets too.' };
  }
  const db = createClient() as any;
  const { data, error } = await db.from('property_appliances').update({
    guest_guidance: parsed.data.guestGuidance || null,
    private_notes: parsed.data.privateNotes || null,
    guest_visible: formData.get('guestVisible') === 'on',
    updated_at: new Date().toISOString(),
  }).eq('id', applianceId).eq('property_id', propertyId).select('id').maybeSingle();
  if (error || !data) return { error: 'Could not save this appliance. Please try again.' };
  await audit(createClient(), { action: 'appliance.guidance_saved', propertyId, targetType: 'property_appliances', targetId: applianceId });
  refresh(propertyId);
  return { success: 'Saved as a draft. Review and approve guest guidance before it answers guests.' };
}

export async function approveApplianceGuidanceAction(
  _prev: GuidanceActionState, formData: FormData,
): Promise<GuidanceActionState> {
  const ids = parseIds(formData);
  if (!ids.success) return { error: 'Choose a valid appliance.' };
  const { propertyId, applianceId } = ids.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot approve this appliance guidance.' };
  const actor = await getSessionContext();
  if (!actor) return { error: 'Sign in again before approving.' };
  const db = createClient() as any;
  const { data: item, error: readError } = await db.from('property_appliances')
    .select('guest_guidance, guest_visible').eq('id', applianceId).eq('property_id', propertyId).maybeSingle();
  if (readError || !item?.guest_guidance) return { error: 'Write guest guidance before approving it.' };
  if (unsafe(item.guest_guidance)) return { error: 'Guidance contains credentials or technician-only instructions.' };
  const { data, error } = await db.from('property_appliances').update({
    guidance_approved_at: new Date().toISOString(), guidance_approved_by: actor.user.id,
    updated_at: new Date().toISOString(),
  }).eq('id', applianceId).eq('property_id', propertyId).select('id').maybeSingle();
  if (error || !data) return { error: 'Could not approve this guidance.' };
  await audit(createClient(), { action: 'appliance.guidance_approved', propertyId, targetType: 'property_appliances', targetId: applianceId });
  refresh(propertyId);
  return { success: item.guest_visible ? 'Approved for this appliance.' : 'Approved, but this appliance is hidden from guests.' };
}

export async function addApplianceAnswerAction(
  _prev: GuidanceActionState, formData: FormData,
): Promise<GuidanceActionState> {
  const ids = parseIds(formData);
  if (!ids.success) return { error: 'Choose a valid appliance.' };
  const { propertyId, applianceId } = ids.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot add an answer for this appliance.' };
  const parsed = z.object({
    question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(4000),
  }).safeParse({ question: formData.get('question'), answer: formData.get('answer') });
  if (!parsed.success) return { error: 'Enter a question and an answer under 4,000 characters.' };
  if (unsafe(`${parsed.data.question}\n${parsed.data.answer}`)) return { error: 'Remove credentials and technician-only instructions.' };
  const actor = await getSessionContext();
  if (!actor) return { error: 'Sign in again before saving.' };
  const db = createClient() as any;
  const { data: appliance, error: readError } = await db.from('property_appliances')
    .select('model_number').eq('id', applianceId).eq('property_id', propertyId).maybeSingle();
  if (readError || !appliance) return { error: 'That appliance is no longer available.' };
  const { data, error } = await db.from('appliance_answers').insert({
    property_id: propertyId, appliance_id: applianceId, question: parsed.data.question,
    answer: parsed.data.answer, source_kind: 'host', model_number_snapshot: appliance.model_number,
    status: 'draft', created_by: actor.user.id,
  }).select('id').maybeSingle();
  if (error || !data) return { error: 'Could not save that answer.' };
  await audit(createClient(), { action: 'appliance.answer_drafted', propertyId, targetType: 'appliance_answers', targetId: data.id });
  refresh(propertyId);
  return { success: 'Answer saved as a draft. Approve it before guests can use it.' };
}

export async function approveApplianceAnswerAction(
  _prev: GuidanceActionState, formData: FormData,
): Promise<GuidanceActionState> {
  const ids = parseIds(formData);
  const answerId = z.string().uuid().safeParse(formData.get('answerId'));
  if (!ids.success || !answerId.success) return { error: 'Choose a valid answer.' };
  const { propertyId, applianceId } = ids.data;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You cannot approve this answer.' };
  const actor = await getSessionContext();
  if (!actor) return { error: 'Sign in again before approving.' };
  const db = createClient() as any;
  const { data: appliance } = await db.from('property_appliances')
    .select('model_number').eq('id', applianceId).eq('property_id', propertyId).maybeSingle();
  const { data: answer } = await db.from('appliance_answers')
    .select('question, answer, status, model_number_snapshot').eq('id', answerId.data)
    .eq('appliance_id', applianceId).eq('property_id', propertyId).maybeSingle();
  if (!appliance || !answer || answer.status !== 'draft') return { error: 'This draft is no longer available.' };
  if (answer.model_number_snapshot !== appliance.model_number || unsafe(`${answer.question}\n${answer.answer}`)) {
    return { error: 'This answer needs review for the current model or contains unsafe instructions.' };
  }
  const { data, error } = await db.from('appliance_answers').update({
    status: 'approved', approved_at: new Date().toISOString(), approved_by: actor.user.id,
    updated_at: new Date().toISOString(),
  }).eq('id', answerId.data).eq('appliance_id', applianceId).eq('property_id', propertyId)
    .eq('status', 'draft').select('id').maybeSingle();
  if (error || !data) return { error: 'Could not approve this answer. Check for a duplicate question.' };
  await audit(createClient(), { action: 'appliance.answer_approved', propertyId, targetType: 'appliance_answers', targetId: answerId.data });
  refresh(propertyId);
  return { success: 'Answer approved for this appliance.' };
}
