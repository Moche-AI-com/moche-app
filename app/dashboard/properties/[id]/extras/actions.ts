'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { extraOfferSchema } from '@/lib/validation';
import { parseExtraOptionsInput } from '@/lib/guest/extras';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface ExtraFormState {
  error?: string;
  success?: string;
}

// Add-on — host CRUD for guest extras. Writes go through the RLS-respecting server
// client; can_edit_property (owner or editing co-host) is the real boundary, enforced
// here AND by the table's RLS policies. Guest visibility is NOT gated by tier — creating
// an offer is the host's opt-in — so there is no entitlement check on these mutations.
export async function createExtraAction(_prev: ExtraFormState, formData: FormData): Promise<ExtraFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const parsed = extraOfferSchema.safeParse({
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    priceText: formData.get('priceText') || '',
    ctaLabel: formData.get('ctaLabel') || '',
    active: formData.get('active') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
    category: formData.get('category') || '',
    isFavorite: formData.get('isFavorite') === 'on',
    maxQuantity: Number(formData.get('maxQuantity') ?? 0) || null,
    kind: formData.get('kind') === 'package' ? 'package' : 'quantity',
    unitLabel: formData.get('unitLabel') || '',
    optionLabel: formData.get('optionLabel') || '',
    options: formData.get('options') || '',
    details: formData.get('details') || '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the offer details.' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from('guest_extras').insert({
    property_id: propertyId,
    title: d.title,
    description: d.description ? d.description : null,
    price_text: d.priceText ? d.priceText : null,
    cta_label: d.ctaLabel ? d.ctaLabel : 'Request',
    active: d.active,
    sort_order: d.sortOrder,
    category: d.category ? d.category : null,
    is_favorite: d.isFavorite,
    max_quantity: d.maxQuantity ?? null,
    kind: d.kind,
    // A package is one bundle, so a unit label and a per-request ceiling are
    // meaningless for it; blank them rather than storing values the guest UI ignores.
    unit_label: d.kind === 'package' ? null : (d.unitLabel ? d.unitLabel : null),
    option_label: d.optionLabel ? d.optionLabel : null,
    options: parseExtraOptionsInput(d.options),
    details: d.details ? d.details : null,
  } as never);

  if (error) {
    log.warn('extra_create_failed', { error: error.message });
    return { error: 'Could not create the offer. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.extra.created',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/extras`);
  return { success: 'Offer added.' };
}

export async function updateExtraAction(_prev: ExtraFormState, formData: FormData): Promise<ExtraFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const offerId = String(formData.get('offerId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const parsed = extraOfferSchema.safeParse({
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    priceText: formData.get('priceText') || '',
    ctaLabel: formData.get('ctaLabel') || '',
    active: formData.get('active') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
    category: formData.get('category') || '',
    isFavorite: formData.get('isFavorite') === 'on',
    maxQuantity: Number(formData.get('maxQuantity') ?? 0) || null,
    kind: formData.get('kind') === 'package' ? 'package' : 'quantity',
    unitLabel: formData.get('unitLabel') || '',
    optionLabel: formData.get('optionLabel') || '',
    options: formData.get('options') || '',
    details: formData.get('details') || '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the offer details.' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase
    .from('guest_extras')
    .update({
      title: d.title,
      description: d.description ? d.description : null,
      price_text: d.priceText ? d.priceText : null,
      cta_label: d.ctaLabel ? d.ctaLabel : 'Request',
      active: d.active,
      sort_order: d.sortOrder,
      category: d.category ? d.category : null,
      is_favorite: d.isFavorite,
      max_quantity: d.maxQuantity ?? null,
      kind: d.kind,
      unit_label: d.kind === 'package' ? null : (d.unitLabel ? d.unitLabel : null),
      option_label: d.optionLabel ? d.optionLabel : null,
      options: parseExtraOptionsInput(d.options),
      details: d.details ? d.details : null,
    } as never)
    .eq('id', offerId)
    .eq('property_id', propertyId);

  if (error) {
    log.warn('extra_update_failed', { error: error.message });
    return { error: 'Could not save the offer. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.extra.updated',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: offerId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/extras`);
  return { success: 'Offer saved.' };
}

// Quick active/paused toggle without opening the full edit form.
export async function toggleExtraAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const offerId = String(formData.get('offerId') ?? '');
  const active = formData.get('active') === 'true';
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return;

  const supabase = createClient();
  await supabase.from('guest_extras').update({ active } as never).eq('id', offerId).eq('property_id', propertyId);
  await audit(supabase, {
    action: 'property.extra.toggled',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: offerId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/extras`);
}

export async function deleteExtraAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const offerId = String(formData.get('offerId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return;

  const supabase = createClient();
  await supabase.from('guest_extras').delete().eq('id', offerId).eq('property_id', propertyId);
  await audit(supabase, {
    action: 'property.extra.deleted',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: offerId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/extras`);
}
