'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession, requirePropertyAccess, getSessionContext, isPreLaunch } from '@/lib/auth/guards';
import { propertyAddressSchema, propertyCreateWithGeoSchema, propertyUpdateSchema, propertySettingsSchema } from '@/lib/validation';
import { canCreateProperty, getEntitlements } from '@/lib/billing/entitlements';
import { DEFAULT_HOST_LANGUAGE, resolveLanguage } from '@/lib/guest/languages';
import { computeBrainHealth } from '@/lib/brain/health';
import { slugWithSuffix } from '@/lib/slug';
import { audit } from '@/lib/audit';
import { purgeProperty, isDeleteConfirmed, DELETE_CONFIRMATION_WORD } from '@/lib/properties/purge';
import { DEFAULT_MODULES, LAUNCH_DATE_LABEL, RESTRICTED_TOPIC_KEYS, TONE_PRESET_IDS } from '@/lib/constants';
import type { Json } from '@/lib/database.types';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';
import { serverEnv } from '@/lib/env';
import { loadCompleteness } from '@/lib/brain/values';
import { COMPLETENESS_SHIP_THRESHOLD } from '@/lib/brain/completeness';

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
    addressLine1: formData.get('addressLine1') || '',
    addressLine2: formData.get('addressLine2') || '',
    postalCode: formData.get('postalCode') || '',
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
      address_line1: d.addressLine1,
      address_line2: d.addressLine2 || null,
      postal_code: d.postalCode || null,
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

  // Optional listing link (backlog P4-02). Deliberately NOT fetched here: a slow
  // or bot-walled listing page must never delay or fail property creation. The
  // property page picks it up and imports it straight into the Brain.
  const listingUrl = String(formData.get('listingUrl') ?? '').trim();
  const importable = listingUrl && /^https?:\/\//i.test(listingUrl) && listingUrl.length <= 2000;

  redirect(
    importable
      ? `/dashboard/properties/${property.id}?import=${encodeURIComponent(listingUrl)}`
      : `/dashboard/properties/${property.id}`,
  );
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
    // Cover images are managed by their own route (POST /api/properties/:id/cover)
    // and are NOT part of this form any more. Only parse the field when it is
    // actually present, so submitting the details form can never blank a cover.
    ...(formData.has('coverImageUrl') ? { coverImageUrl: formData.get('coverImageUrl') || '' } : {}),
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
      ...(formData.has('coverImageUrl') ? { cover_image_url: d.coverImageUrl || null } : {}),
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

// Address captured on the listing-import review page. The import job creates the
// draft property from the listing title alone (lib/property-import/jobs.ts), so
// this is where the required main address lands for imported properties. Only
// address/location fields are touched — name, branding, and cover image belong
// to their own forms and are never clobbered here.
export async function updatePropertyAddressAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const parsed = propertyAddressSchema.safeParse({
    addressLine1: formData.get('addressLine1') || '',
    addressLine2: formData.get('addressLine2') || '',
    city: formData.get('city') || '',
    region: formData.get('region') || '',
    postalCode: formData.get('postalCode') || '',
    country: formData.get('country') || '',
    lat: formData.get('lat') ?? '',
    lng: formData.get('lng') ?? '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the address.' };
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase
    .from('properties')
    .update({
      address_line1: d.addressLine1,
      address_line2: d.addressLine2 || null,
      city: d.city || null,
      region: d.region || null,
      country: d.country || null,
      lat: d.lat ?? null,
      lng: d.lng ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propertyId);

  if (error) {
    log.warn('property_address_update_failed', { error: error.message });
    return { error: 'Could not save the address. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.address.updated',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath('/dashboard/properties');
  return { success: 'Address saved.' };
}

export async function updatePropertySettingsAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const supabase = createClient();

  // The three core sliders (creativity, escalation sensitivity, post-checkout hours)
  // are FREE for everyone. Persona & advanced controls (name, tone, language, response
  // length, restricted topics, custom system prompt, portal modules) are premium: a
  // paid plan OR the per-property is_premium_override unlocks them. Enforced HERE — the
  // UI lock is convenience only; this is the real boundary.
  const ent = await getEntitlements(supabase, access.property.host_account_id);
  const { data: current } = await supabase
    .from('property_settings')
    .select('is_premium_override')
    .eq('property_id', propertyId)
    .maybeSingle();
  const premiumUnlocked = ent.conciergeCustomization || (current?.is_premium_override ?? false);

  // Module toggles arrive as individual checkbox fields (module_<key>). Rebuild the full
  // modules map from DEFAULT_MODULES so unchecked boxes are stored as false.
  const modules: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_MODULES)) {
    modules[key] = formData.get(`module_${key}`) === 'on';
  }

  // Restricted topics arrive as one checkbox per option so an unchecked box is an
  // absence rather than a value to parse. Only submitted keys are collected; the
  // schema then rejects anything not in RESTRICTED_TOPIC_KEYS.
  const restrictedTopicKeys = RESTRICTED_TOPIC_KEYS.filter(
    (key) => formData.get(`restricted_topic_${key}`) === 'on',
  );

  const rawTemp = formData.get('aiTemperature');
  const rawThreshold = formData.get('confidenceThreshold');
  const rawGrace = formData.get('gracePeriodHours');

  const parsed = propertySettingsSchema.safeParse({
    conciergeTone: formData.get('conciergeTone') || undefined,
    aiTemperature: rawTemp !== null && rawTemp !== '' ? Number(rawTemp) : undefined,
    confidenceThreshold: rawThreshold !== null && rawThreshold !== '' ? Number(rawThreshold) : undefined,
    gracePeriodHours: rawGrace !== null && rawGrace !== '' ? Number(rawGrace) : undefined,
    conciergeName: formData.get('conciergeName') || undefined,
    systemPromptOverride: formData.get('systemPromptOverride') || undefined,
    responseLength: formData.get('responseLength') || undefined,
    restrictedTopicKeys,
    restrictedTopics: formData.get('restrictedTopics') || undefined,
    language: formData.get('language') || undefined,
    hostLanguage: formData.get('hostLanguage') || undefined,
    // Review nudge is driven by the module toggle below; mirror it onto the dedicated flag.
    reviewNudgeEnabled: modules.review_nudge,
    modules,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the concierge settings.' };
  const d = parsed.data;

  // Free fields always persist. Premium fields persist only when unlocked — a free user
  // POSTing premium fields (disabled fieldsets do not submit, but be defensive) is ignored.
  const premiumPatch = premiumUnlocked
    ? {
        ...(d.conciergeTone !== undefined ? { concierge_tone: d.conciergeTone } : {}),
        ...(d.conciergeName !== undefined ? { concierge_name: d.conciergeName } : {}),
        ...(d.systemPromptOverride !== undefined ? { system_prompt_override: d.systemPromptOverride || null } : {}),
        ...(d.responseLength !== undefined ? { response_length: d.responseLength } : {}),
        ...(d.restrictedTopicKeys !== undefined
          ? { restricted_topic_keys: d.restrictedTopicKeys as unknown as Json }
          : {}),
        ...(d.restrictedTopics !== undefined ? { restricted_topics: d.restrictedTopics || null } : {}),
        ...(d.language !== undefined ? { language: d.language } : {}),
        ...(d.reviewNudgeEnabled !== undefined ? { review_nudge_enabled: d.reviewNudgeEnabled } : {}),
        ...(d.modules !== undefined ? { modules: d.modules as unknown as Json } : {}),
      }
    : {};

  // Upsert so properties created before settings existed still get a row.
  const { error } = await supabase
    .from('property_settings')
    .upsert(
      {
        property_id: propertyId,
        ...(d.aiTemperature !== undefined ? { ai_temperature: d.aiTemperature } : {}),
        ...(d.confidenceThreshold !== undefined ? { confidence_threshold: d.confidenceThreshold } : {}),
        ...(d.gracePeriodHours !== undefined ? { grace_period_hours: d.gracePeriodHours } : {}),
        // Free field, on purpose — see hostLanguage in propertySettingsSchema.
        ...(d.hostLanguage !== undefined
          ? { host_language: resolveLanguage(d.hostLanguage)?.code ?? DEFAULT_HOST_LANGUAGE }
          : {}),
        ...premiumPatch,
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

// Resolve a pre-preset freeform tone note (P4-07).
//
// Tone used to be a free text box. Two live properties still hold prose there,
// including a deliberate personality the host clearly wanted. Rather than guess,
// the note keeps driving the guest prompt verbatim until the host picks one of two
// outcomes here:
//
//   keep    - move the prose into the custom instructions field, where freeform
//             text is still allowed, and apply the chosen preset on top of it.
//   discard - drop the prose and use the chosen preset alone.
//
// Either way legacy_tone_ack_at is stamped, which is what flips the guest prompt
// off the legacy note. Until then nothing about the concierge changes.
export async function resolveLegacyToneAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const choice = String(formData.get('choice') ?? '');
  if (choice !== 'keep' && choice !== 'discard') return { error: 'Choose whether to keep or replace your old tone note.' };

  const preset = String(formData.get('conciergeTone') ?? '');
  if (!(TONE_PRESET_IDS as readonly string[]).includes(preset)) {
    return { error: 'Choose one of the tone presets.' };
  }

  const supabase = createClient();
  const { data: current } = await supabase
    .from('property_settings')
    .select('legacy_tone_note, legacy_tone_ack_at, system_prompt_override')
    .eq('property_id', propertyId)
    .maybeSingle();

  const note = current?.legacy_tone_note?.trim() ?? '';
  // Already answered, or nothing to answer. Treated as success rather than an error
  // so a double submit or a stale tab does not look broken to the host.
  if (!note || current?.legacy_tone_ack_at) {
    revalidatePath(`/dashboard/properties/${propertyId}/settings`);
    return { success: 'Your tone settings are already up to date.' };
  }

  // Appended rather than overwritten so an existing custom instruction survives.
  const existingOverride = current?.system_prompt_override?.trim() ?? '';
  const mergedOverride =
    choice === 'keep'
      ? [existingOverride, note].filter(Boolean).join('\n\n').slice(0, 4000)
      : existingOverride;

  const { error } = await supabase
    .from('property_settings')
    .update({
      concierge_tone: preset,
      legacy_tone_note: null,
      legacy_tone_ack_at: new Date().toISOString(),
      ...(choice === 'keep' ? { system_prompt_override: mergedOverride || null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('property_id', propertyId);

  if (error) {
    log.warn('legacy_tone_resolve_failed', { error: error.message });
    return { error: 'Could not update your tone settings. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.settings.legacy_tone_resolved',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
    // The prose itself is recorded so a host who picked "discard" by mistake can
    // still recover what they had written.
    metadata: { choice, preset, previous_note: note },
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath(`/dashboard/properties/${propertyId}/settings`);
  return {
    success:
      choice === 'keep'
        ? 'Saved. Your old tone note now lives in custom instructions.'
        : 'Saved. Your concierge now uses the preset you picked.',
  };
}

// Review Nudge config — enable, destination review_url, and the "auto" toggle
// (surface automatically on a positive guest signal). Gated to Pro+ via the
// reviewNudge entitlement; enforced HERE (the UI lock is convenience only).
export async function updateReviewNudgeAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to edit this property.' };

  const supabase = createClient();
  const ent = await getEntitlements(supabase, access.property.host_account_id);
  if (!ent.reviewNudge) {
    return { error: 'The Review nudge is a Pro feature. Upgrade to enable it.' };
  }

  const parsed = propertySettingsSchema
    .pick({ reviewUrl: true, reviewNudgeEnabled: true, reviewNudgeAuto: true })
    .safeParse({
      reviewUrl: formData.get('reviewUrl') || '',
      reviewNudgeEnabled: formData.get('reviewNudgeEnabled') === 'on',
      reviewNudgeAuto: formData.get('reviewNudgeAuto') === 'on',
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the review link.' };
  const d = parsed.data;

  // Keep the modules.review_nudge flag in sync with the dedicated enable toggle so
  // the portal module list and this control never disagree.
  const { data: current } = await supabase
    .from('property_settings')
    .select('modules')
    .eq('property_id', propertyId)
    .maybeSingle();
  const modules = { ...DEFAULT_MODULES, ...((current?.modules ?? {}) as Record<string, boolean>) };
  modules.review_nudge = d.reviewNudgeEnabled ?? false;

  const { error } = await supabase
    .from('property_settings')
    .upsert(
      {
        property_id: propertyId,
        review_url: d.reviewUrl ? d.reviewUrl : null,
        review_nudge_enabled: d.reviewNudgeEnabled ?? false,
        review_nudge_auto: d.reviewNudgeAuto ?? false,
        modules: modules as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'property_id' },
    );

  if (error) {
    log.warn('review_nudge_update_failed', { error: error.message });
    return { error: 'Could not save the review nudge settings. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.review_nudge.updated',
    actorProfileId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/settings`);
  return { success: 'Review nudge saved.' };
}

async function setStatus(propertyId: string, status: 'live' | 'paused' | 'draft' | 'archived') {
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editProperty) return { error: 'You do not have permission to change this property.' };
  const supabase = createClient();

  if (status === 'live') {
    // The pre-launch gate, and the only thing standing between a pre-launch host
    // and a real guest.
    //
    // Hosts can now build their whole setup before launch (see the note on
    // requireLaunchAccess in lib/auth/guards.ts). Every guest-facing surface keys
    // off `properties.status = 'live'`, so refusing that one transition keeps the
    // guest side shut without a single redirect anywhere else. Founders bypass it
    // because they have to be able to exercise the live path end to end before
    // launch day.
    if (isPreLaunch()) {
      const ctx = await getSessionContext();
      if (!ctx?.isFounder) {
        return {
          error: `Publishing opens on ${LAUNCH_DATE_LABEL}, when guest links and QR codes switch on. Until then you can build this property and preview the guest portal exactly as a guest will see it.`,
        };
      }
    }

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
    if (serverEnv.requireCompletenessToPublish) {
      // Registry completeness, the canonical figure (Amendment 001-A.4). The
      // threshold and the hard blocks are separate conditions: 100% with an
      // unanswered door code still cannot publish, because a guest who cannot
      // get in is not helped by a high score.
      const completeness = await loadCompleteness(supabase, propertyId);
      if (!completeness.canPublish) {
        const blockers = completeness.hardBlocksOutstanding.map((g) => g.label);
        return {
          error: blockers.length
            ? `Answer these before going live: ${blockers.join(', ')}.`
            : `Your Brain is ${completeness.pct.toFixed(0)}% complete. ${COMPLETENESS_SHIP_THRESHOLD}% is needed to go live.`,
        };
      }
    }
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('properties')
    .update({
      status,
      published_at: status === 'live' ? now : undefined,
      // Archiving stamps the date Reports orders by; every other transition
      // clears it, so a restore-then-archive cycle cannot leave a stale date
      // behind and sort the property into the wrong place in the archive.
      archived_at: status === 'archived' ? now : null,
      updated_at: now,
    })
    .eq('id', propertyId);
  if (error) return { error: 'Could not update the property status.' };

  await audit(supabase, { action: `property.${status}`, propertyId, targetType: 'property', targetId: propertyId });
  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath('/dashboard/properties');
  // Archived properties are listed under Reports, so both the source and the
  // destination list have to be revalidated or the property appears to vanish
  // without arriving anywhere.
  revalidatePath('/dashboard/reports');
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

/**
 * Brings an archived property back into the active Properties list.
 *
 * Restores to `paused` rather than `live` deliberately: a property coming out of
 * the archive may have stale pricing, stale door codes, or a guest portal the
 * host has not looked at in months, and silently reopening it to guests is not a
 * decision this button should make on their behalf. The host publishes it again
 * when they are ready.
 */
export async function restorePropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const result = await setStatus(propertyId, 'paused');
  if (result.error) return result;
  return { success: 'Property restored. Publish it again when you\u2019re ready.' };
}

/**
 * Permanently destroys a property, gated on the host typing the word "delete".
 *
 * This replaced a soft delete that only set `deleted_at`. The soft delete was
 * the wrong contract for a button labelled "delete for good": the property
 * disappeared from the dashboard while every guest conversation, address, door
 * code, and uploaded document stayed in the database indefinitely.
 *
 * The host's reports survive by design — archived service requests, completed
 * extras, and past stays are records they may need for a contractor dispute, an
 * owner statement, or their taxes, and losing those to a property cleanup would
 * be its own kind of data loss. See `lib/properties/purge.ts` for exactly what
 * is erased and what is kept.
 *
 * Three things guard the destructive path, in order:
 *   1. `requirePropertyAccess` + `isOwner` — the real authorisation check. Only
 *      the main account holder can erase a property; no delegated role can,
 *      whatever capabilities they have been granted.
 *   2. The typed confirmation — protects against a misclick, not an attacker.
 *      It is verified HERE and not only in the dialog, because a client-side
 *      confirmation is a UI affordance and not a gate.
 *   3. An audit record written BEFORE the delete — see below.
 *
 * The audit row is written first on purpose. `audit_logs.property_id` is
 * `on delete set null`, so the record survives the cascade with the id preserved
 * in its metadata; writing it afterwards would mean a purge that succeeded and
 * then failed to log left no trace of who erased what.
 */
export async function deletePropertyAction(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  // Owner-only: the main account holder, not any role with property edit rights.
  if (!access.isOwner) {
    return { error: 'Only the account owner can permanently delete a property.' };
  }

  const typed = formData.get('confirm');
  if (!isDeleteConfirmed(typeof typed === 'string' ? typed : null)) {
    return { error: `Type “${DELETE_CONFIRMATION_WORD}” to confirm you want this property erased for good.` };
  }

  const supabase = createClient();

  await audit(supabase, {
    action: 'property.purged',
    propertyId,
    targetType: 'property',
    targetId: propertyId,
    metadata: {
      property_id: propertyId,
      display_name: access.property.display_name,
      slug: access.property.slug,
      status: access.property.status,
    } as Json,
  });

  const result = await purgeProperty(supabase, propertyId);
  if (!result.purged) {
    return { error: 'Could not delete the property. Nothing was removed — please try again.' };
  }

  if (result.warnings.length > 0) {
    // The database records are gone, which is what the host asked for. Leaked
    // storage bytes are a cleanup problem for us, not a failure to report to
    // them mid-flow, so this is logged rather than surfaced.
    log.warn('property_purge_incomplete_storage', { propertyId, warnings: result.warnings });
  }

  await capture('property_purged', access.property.host_account_id, { propertyId });

  revalidatePath('/dashboard/properties');
  revalidatePath('/dashboard/reports');
  revalidatePath('/dashboard');
  redirect('/dashboard/properties?deleted=1');
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
    // Restricted topics are a safety setting, so a clone inherits them rather than
    // silently falling back to the defaults.
    restricted_topic_keys: (srcSettings?.restricted_topic_keys ?? undefined) as Json | undefined,
    restricted_topics: srcSettings?.restricted_topics ?? undefined,
    // A pending legacy tone note is deliberately NOT cloned: the new property starts
    // on a preset, so there is nothing for its host to be asked about.
    legacy_tone_ack_at: new Date().toISOString(),
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
