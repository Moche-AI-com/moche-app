'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { propertyCreateWithGeoSchema, propertyUpdateSchema, propertySettingsSchema } from '@/lib/validation';
import { canCreateProperty, getEntitlements } from '@/lib/billing/entitlements';
import { computeBrainHealth } from '@/lib/brain/health';
import { slugWithSuffix } from '@/lib/slug';
import { audit } from '@/lib/audit';
import { DEFAULT_MODULES } from '@/lib/constants';
import type { Json } from '@/lib/database.types';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';
import { serverEnv } from '@/lib/env';

export interface PropertyFormState {
  error?: string;
  success?: string;
}

export async function createPropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const ctx = await requireSession();
  const supabase = createClient();

  const gate = await canCreateProperty(supabase, ctx.account.id);
  if (!gate.ok) {
    return { error: `You've reached your plan's limit of ${gate.limit} propert${gate.limit === 1 ? 'y' : 'ies'}. Upgrade to add more.` };
  }

  const parsed = propertyCreateWithGeoSchema.safeParse({
    displayName: formData.get('displayName'),
    city: formData.get('city') || '',
    region: formData.get('region') || '',
    country: formData.get('country') || '',
    timezone: formData.get('timezone') || 'UTC',
    locale: formData.get('locale') || 'en',
    lat: formData.get('lat') ?? '',
    lng: formData.get('lng') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the property details.' };

  const d = parsed.data;
  const { data: property, error } = await supabase
    .from('properties')
    .insert({
      host_account_id: ctx.account.id,
      display_name: d.displayName,
      slug: slugWithSuffix(d.displayName),
      city: d.city || null,
      region: d.region || null,
      country: d.country || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      timezone: d.timezone,
      locale: d.locale,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !property) {
    log.warn('property_create_failed', { error: error?.message });
    return { error: 'Could not create the property. Please try again.' };
  }

  // Seed default settings so the concierge + portal have a config row to read.
  await supabase.from('property_settings').insert({ property_id: property.id, modules: DEFAULT_MODULES as unknown as Json });

  await audit(supabase, {
    action: 'property.created',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    propertyId: property.id,
    targetType: 'property',
    targetId: property.id,
  });

  // Server-safe analytics: identified by host user id, no property PII beyond its id.
  await capture('property_created', ctx.user.id, { property_id: property.id });

  redirect(`/dashboard/properties/${property.id}`);
}

export async function updatePropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const parsed = propertyUpdateSchema.safeParse({
    displayName: formData.get('displayName') || undefined,
    city: formData.get('city') || '',
    region: formData.get('region') || '',
    country: formData.get('country') || '',
    timezone: formData.get('timezone') || undefined,
    locale: formData.get('locale') || undefined,
    addressLine1: formData.get('addressLine1') || '',
    addressLine2: formData.get('addressLine2') || '',
    postalCode: formData.get('postalCode') || '',
    lat: formData.get('lat') ?? '',
    lng: formData.get('lng') ?? '',
    brandPrimary: formData.get('brandPrimary') || '',
    brandAccent: formData.get('brandAccent') || '',
    coverImageUrl: formData.get('coverImageUrl') || '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      ...(d.displayName ? { display_name: d.displayName } : {}),
      city: d.city || null,
      region: d.region || null,
      country: d.country || null,
      ...(d.timezone ? { timezone: d.timezone } : {}),
      ...(d.locale ? { locale: d.locale } : {}),
      address_line1: d.addressLine1 || null,
      address_line2: d.addressLine2 || null,
      postal_code: d.postalCode || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      brand_primary: d.brandPrimary || null,
      brand_accent: d.brandAccent || null,
      cover_image_url: d.coverImageUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propertyId);

  if (error) {
    log.warn('property_update_failed', { error: error.message });
    return { error: 'Could not save changes. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.updated',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath(`/dashboard/properties/${propertyId}/settings`);
  return { success: 'Property saved.' };
}

export async function updatePropertySettingsAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const supabase = createClient();
  // Concierge customization is a paid upgrade (Pro and up). Enforce server-side — the UI
  // lock is convenience only; this is the real boundary.
  const ent = await getEntitlements(supabase, access.property.host_account_id);
  if (!ent.conciergeCustomization) {
    return { error: 'Concierge customization is available on the Pro plan and above. Upgrade to tune tone, creativity, escalation, and portal modules.' };
  }

  // Module toggles arrive as individual checkbox fields (module_<key>). Rebuild the full
  // modules map from DEFAULT_MODULES so unchecked boxes are stored as false.
  const modules: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_MODULES)) {
    modules[key] = formData.get(`module_${key}`) === 'on';
  }

  const rawTemp = formData.get('aiTemperature');
  const rawThreshold = formData.get('confidenceThreshold');
  const rawGrace = formData.get('gracePeriodHours');

  const parsed = propertySettingsSchema.safeParse({
    conciergeTone: formData.get('conciergeTone') || undefined,
    aiTemperature: rawTemp !== null && rawTemp !== '' ? Number(rawTemp) : undefined,
    confidenceThreshold: rawThreshold !== null && rawThreshold !== '' ? Number(rawThreshold) : undefined,
    gracePeriodHours: rawGrace !== null && rawGrace !== '' ? Number(rawGrace) : undefined,
    // Review nudge is driven by the module toggle below; mirror it onto the dedicated flag.
    reviewNudgeEnabled: modules.review_nudge,
    modules,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the concierge settings.' };
  const d = parsed.data;

  // Upsert so properties created before settings existed still get a row.
  const { error } = await supabase
    .from('property_settings')
    .upsert(
      {
        property_id: propertyId,
        ...(d.conciergeTone !== undefined ? { concierge_tone: d.conciergeTone } : {}),
        ...(d.aiTemperature !== undefined ? { ai_temperature: d.aiTemperature } : {}),
        ...(d.confidenceThreshold !== undefined ? { confidence_threshold: d.confidenceThreshold } : {}),
        ...(d.gracePeriodHours !== undefined ? { grace_period_hours: d.gracePeriodHours } : {}),
        ...(d.reviewNudgeEnabled !== undefined ? { review_nudge_enabled: d.reviewNudgeEnabled } : {}),
        ...(d.modules !== undefined ? { modules: d.modules as unknown as Json } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'property_id' },
    );

  if (error) {
    log.warn('property_settings_update_failed', { error: error.message });
    return { error: 'Could not save the concierge settings. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.settings.updated',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath(`/dashboard/properties/${propertyId}/settings`);
  return { success: 'Concierge settings saved.' };
}

async function setStatus(propertyId: string, status: 'live' | 'paused' | 'draft' | 'archived') {
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to change this property.' };
  const supabase = createClient();

  if (status === 'live') {
    // Publish gates are configurable (see lib/env.ts). Defaults are OFF so a property with
    // required fields alone can go live for demos/testing; the concierge gracefully handles an
    // empty Brain by telling guests it will pass questions to the host. Flip the env flags on
    // for production billing to require a paid plan + core Brain before publishing.
    if (serverEnv.requirePlanToPublish) {
      const ent = await getEntitlements(supabase, access.property.host_account_id);
      if (!ent.active) {
        return { error: 'Choose a plan to publish your property.' };
      }
    }
    if (serverEnv.requireBrainToPublish) {
      const { data: items } = await supabase
        .from('brain_items')
        .select('category, status, deleted_at, visibility')
        .eq('property_id', propertyId);
      const health = computeBrainHealth(items ?? []);
      if (!health.canGoLive) {
        return { error: 'Add core info (essentials, check-in/out, house rules) before going live.' };
      }
    }
  }

  const { error } = await supabase
    .from('properties')
    .update({
      status,
      published_at: status === 'live' ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propertyId);
  if (error) return { error: 'Could not update the property status.' };

  await audit(supabase, { action: `property.${status}`, propertyId, targetType: 'property', targetId: propertyId });
  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath('/dashboard/properties');
  return { success: `Property ${status === 'live' ? 'published' : status}.` };
}

export async function publishPropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  return setStatus(String(formData.get('propertyId') ?? ''), 'live');
}
export async function pausePropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  return setStatus(String(formData.get('propertyId') ?? ''), 'paused');
}
export async function archivePropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  return setStatus(String(formData.get('propertyId') ?? ''), 'archived');
}

export async function deletePropertyAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) redirect(`/dashboard/properties/${propertyId}`);
  const supabase = createClient();
  await supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString(), status: 'archived' })
    .eq('id', propertyId);
  await audit(supabase, { action: 'property.deleted', propertyId, targetType: 'property', targetId: propertyId });
  revalidatePath('/dashboard/properties');
  redirect('/dashboard/properties');
}

// Clones a property's brain content into a brand-new property (Pro+ feature).
export async function clonePropertyAction(formData: FormData): Promise<void> {
  const sourceId = String(formData.get('propertyId') ?? '');
  const ctx = await requireSession();
  const supabase = createClient();

  const ent = await getEntitlements(supabase, ctx.account.id);
  if (!ent.cloning) redirect(`/dashboard/properties/${sourceId}?err=cloning`);

  const gate = await canCreateProperty(supabase, ctx.account.id);
  if (!gate.ok) redirect(`/dashboard/properties/${sourceId}?err=limit`);

  const access = await requirePropertyAccess(sourceId);
  const src = access.property;

  const { data: created, error } = await supabase
    .from('properties')
    .insert({
      host_account_id: ctx.account.id,
      display_name: `${src.display_name} (copy)`,
      slug: slugWithSuffix(src.display_name),
      city: src.city,
      region: src.region,
      country: src.country,
      timezone: src.timezone,
      locale: src.locale,
      brand_primary: src.brand_primary,
      brand_accent: src.brand_accent,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error || !created) redirect(`/dashboard/properties/${sourceId}?err=clone`);

  const { data: srcSettings } = await supabase.from('property_settings').select('*').eq('property_id', sourceId).maybeSingle();
  await supabase.from('property_settings').insert({
    property_id: created.id,
    modules: (srcSettings?.modules ?? DEFAULT_MODULES) as unknown as Json,
    concierge_tone: srcSettings?.concierge_tone ?? undefined,
    confidence_threshold: srcSettings?.confidence_threshold ?? undefined,
    grace_period_hours: srcSettings?.grace_period_hours ?? undefined,
  });

  // Copy manual brain items (text-based). Ingested chunks are re-embedded lazily; here we
  // copy the source items so the new property starts with the same knowledge, marked for re-index.
  const { data: items } = await supabase
    .from('brain_items')
    .select('title, body, category, visibility, source_type')
    .eq('property_id', sourceId)
    .is('deleted_at', null);
  if (items && items.length > 0) {
    await supabase.from('brain_items').insert(
      items.map((it) => ({
        property_id: created.id,
        title: it.title,
        body: it.body,
        category: it.category,
        visibility: it.visibility,
        source_type: 'clone' as const,
        status: 'pending' as const,
        created_by: ctx.user.id,
      })),
    );
  }

  const { data: recs } = await supabase
    .from('recommendations')
    .select('name, category, description, address, distance_note, url, visibility')
    .eq('property_id', sourceId)
    .is('deleted_at', null);
  if (recs && recs.length > 0) {
    await supabase.from('recommendations').insert(recs.map((r) => ({ ...r, property_id: created.id })));
  }

  await audit(supabase, {
    action: 'property.cloned',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    propertyId: created.id,
    targetType: 'property',
    targetId: sourceId,
  });

  redirect(`/dashboard/properties/${created.id}`);
}
