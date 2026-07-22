'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { upsellOfferSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface UpsellFormState {
  error?: string;
  success?: string;
}

// Add-on — host CRUD for upsell offers. Writes go through the RLS-respecting server
// client; can_edit_property (owner or editing co-host) is the real boundary, enforced
// here AND by the table's RLS policies. Guest visibility is NOT gated by tier — creating
// an offer is the host's opt-in — so there is no entitlement check on these mutations.
export async function createUpsellAction(_prev: UpsellFormState, formData: FormData): Promise<UpsellFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const parsed = upsellOfferSchema.safeParse({
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    priceText: formData.get('priceText') || '',
    ctaLabel: formData.get('ctaLabel') || '',
    active: formData.get('active') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the offer details.' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from('upsell_offers').insert({
    property_id: propertyId,
    title: d.title,
    description: d.description ? d.description : null,
    price_text: d.priceText ? d.priceText : null,
    cta_label: d.ctaLabel ? d.ctaLabel : 'Request',
    active: d.active,
    sort_order: d.sortOrder,
  } as never);

  if (error) {
    log.warn('upsell_create_failed', { error: error.message });
    return { error: 'Could not create the offer. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.upsell.created',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/upsells`);
  return { success: 'Offer added.' };
}

export async function updateUpsellAction(_prev: UpsellFormState, formData: FormData): Promise<UpsellFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const offerId = String(formData.get('offerId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const parsed = upsellOfferSchema.safeParse({
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    priceText: formData.get('priceText') || '',
    ctaLabel: formData.get('ctaLabel') || '',
    active: formData.get('active') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the offer details.' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase
    .from('upsell_offers')
    .update({
      title: d.title,
      description: d.description ? d.description : null,
      price_text: d.priceText ? d.priceText : null,
      cta_label: d.ctaLabel ? d.ctaLabel : 'Request',
      active: d.active,
      sort_order: d.sortOrder,
    } as never)
    .eq('id', offerId)
    .eq('property_id', propertyId);

  if (error) {
    log.warn('upsell_update_failed', { error: error.message });
    return { error: 'Could not save the offer. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.upsell.updated',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: offerId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/upsells`);
  return { success: 'Offer saved.' };
}

// Quick active/paused toggle without opening the full edit form.
export async function toggleUpsellAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const offerId = String(formData.get('offerId') ?? '');
  const active = formData.get('active') === 'true';
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return;

  const supabase = createClient();
  await supabase.from('upsell_offers').update({ active } as never).eq('id', offerId).eq('property_id', propertyId);
  await audit(supabase, {
    action: 'property.upsell.toggled',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: offerId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/upsells`);
}

export async function deleteUpsellAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const offerId = String(formData.get('offerId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return;

  const supabase = createClient();
  await supabase.from('upsell_offers').delete().eq('id', offerId).eq('property_id', propertyId);
  await audit(supabase, {
    action: 'property.upsell.deleted',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: offerId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/upsells`);
}
