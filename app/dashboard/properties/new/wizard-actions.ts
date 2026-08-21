'use server';

// Server actions for the multi-step Add Property wizard (directive §2).
//
// SHAPE
// The wizard creates the draft property on step 1 and then saves each subsequent
// step as the host completes it. That is deliberate: an onboarding flow that holds
// eleven steps of answers in browser state and posts them all at the end loses
// everything to a closed tab, and this flow is long enough that closed tabs happen.
// Each step is durable the moment it is submitted.
//
// AUTHORISATION
// Step 1 goes through `createDraftProperty`, which calls `requireSession` and the
// plan gate. Every later step re-checks `requirePropertyAccess` on the property id
// the client sent, because a client-supplied id is never trusted just because an
// earlier call in the same flow produced one.
//
// BOUNDARY 4
// Answers the host typed are written directly (see lib/brain/host-value.ts for the
// full justification). Content a MODEL produced — the final document/paste step —
// goes to proposed_updates for review, with no exception.

import { revalidatePath } from 'next/cache';
import { createDraftProperty } from '../actions';
import { requirePropertyAccess, requireSession } from '@/lib/auth/guards';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { setHostValues } from '@/lib/brain/host-value';
import { deepIntake } from '@/lib/onboarding/deep-intake';
import { loadActiveValues } from '@/lib/brain/values';
import { APPLICABILITY_PREDICATES } from '@/lib/brain/completeness';
import {
  WIZARD_STEPS,
  visibleQuestions,
  composeValue,
  composeSpaceSummary,
  derivedMultiStory,
  type WizardQuestion,
} from '@/lib/onboarding/wizard';
import { storageCategoryFor } from '@/lib/brain/taxonomy';
import { reindexBrainItem } from '../[id]/brain/actions';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

const MAX_PASTE_CHARS = 40000;

export interface WizardCreateState {
  error?: string;
  propertyId?: string;
}

/**
 * Step 1. Creates the draft property, then records the counts the registry has no
 * field for as one composed Brain entry in the space_details section.
 */
export async function createWizardPropertyAction(
  _prev: WizardCreateState,
  formData: FormData,
): Promise<WizardCreateState> {
  const created = await createDraftProperty({
    displayName: formData.get('displayName'),
    city: formData.get('city'),
    region: formData.get('region'),
    country: formData.get('country'),
    timezone: formData.get('timezone'),
    locale: formData.get('locale'),
    lat: formData.get('lat'),
    lng: formData.get('lng'),
  });
  if (!created.ok) return { error: created.error };

  const summary = composeSpaceSummary({
    floors: intOrNull(formData.get('floors'), 1, 60),
    bedrooms: intOrNull(formData.get('bedrooms'), 0, 60),
    bathrooms: intOrNull(formData.get('bathrooms'), 0, 60),
    squareFeet: intOrNull(formData.get('squareFeet'), 30, 100000),
  });

  if (summary) {
    // `section` is deliberately not written: supabase-migrations-BRAIN-SECTIONS.sql
    // is still unapplied, so the section round-trips through the category map the
    // same way every other write in the Brain manager does today.
    const category = storageCategoryFor('space_details');
    const supabase = createClient();
    const { data: item, error } = await supabase
      .from('brain_items')
      .insert({
        property_id: created.propertyId,
        title: 'Property size and layout',
        body: summary,
        category,
        visibility: 'guest',
        source_type: 'manual_entry',
        status: 'ready',
        created_by: created.actorProfileId,
      })
      .select('id')
      .single();

    if (error || !item) {
      // A failed summary must not cost the host the property they just created. It
      // is a derived convenience entry and no coverage score depends on it, so a
      // warning is the honest outcome rather than a rollback.
      log.warn('wizard_space_summary_failed', { propertyId: created.propertyId, error: error?.message });
    } else {
      await reindexBrainItem(created.propertyId, item.id, 'Property size and layout', summary, 'guest', category);
    }
  }

  return { propertyId: created.propertyId };
}

export interface WizardStepState {
  error?: string;
  /** field_id -> host-facing message, rendered beside the field. */
  fieldErrors?: Record<string, string>;
  savedCount?: number;
  ok?: boolean;
}

/**
 * Saves one question step.
 *
 * The set of fields accepted is derived from the wizard definition and the
 * predicates stored for the property, not from whatever keys the form happened to
 * post and not from a client-supplied predicate list. A client that posts
 * `pool_instructions` for a property with no pool gets it ignored, because the
 * server does not take the client's word for which questions were in scope.
 */
export async function saveWizardStepAction(
  _prev: WizardStepState,
  formData: FormData,
): Promise<WizardStepState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const stepId = String(formData.get('stepId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };
  if (!hasServiceRole()) return { error: 'This is temporarily unavailable. Please try again later.' };

  const ctx = await requireSession();
  const step = WIZARD_STEPS.find((s) => s.id === stepId);
  if (!step) return { error: 'That step does not exist.' };

  const admin = createAdminClient();
  const applicable = await loadAssertedPredicates(admin, propertyId);
  const inScope = new Set(visibleQuestions(applicable).map((q) => q.fieldId));

  const values: { fieldId: string; raw: string }[] = [];
  for (const q of step.questions) {
    if (!inScope.has(q.fieldId)) continue; // gated out for this property
    const raw = readAnswer(formData, q);
    if (raw.length === 0) continue; // skipped question, not an error
    values.push({ fieldId: q.fieldId, raw });
  }

  const result = await setHostValues(admin, {
    propertyId,
    actorProfileId: ctx.user.id,
    values,
  });

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  if (Object.keys(result.errors).length > 0) {
    return { fieldErrors: result.errors, savedCount: result.saved.length };
  }
  return { ok: true, savedCount: result.saved.length };
}

export interface WizardFeaturesState {
  error?: string;
  applicable?: string[];
}

/**
 * The features step. Records which applicability predicates hold for the property.
 *
 * These are not Brain values — they are the denominator of the Coverage Map, and
 * they shape which questions the rest of the wizard asks. Storing them in
 * `property_applicability` means the wizard and the Brain page derive scope from
 * one row set instead of two, so a host who says "no pool" here is not asked about
 * pools on the Brain page either.
 *
 * `is_multi_story` is derived from the floor count on step 1 rather than asked
 * again; a host who said "3 floors" should not then be asked whether the place has
 * more than one floor. An unchecked box is written as `applies = false`, not left
 * absent, so the Brain page can show the host they already answered.
 */
export async function saveWizardFeaturesAction(
  _prev: WizardFeaturesState,
  formData: FormData,
): Promise<WizardFeaturesState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };

  const ctx = await requireSession();
  const checked = new Set(formData.getAll('predicate').map(String));
  const multi = derivedMultiStory(intOrNull(formData.get('floors'), 1, 60));

  const now = new Date().toISOString();
  const rows = APPLICABILITY_PREDICATES.filter((p) => !(p === 'is_multi_story' && multi === null)).map((p) => ({
    property_id: propertyId,
    predicate: p,
    applies: p === 'is_multi_story' ? multi === true : checked.has(p),
    set_by: ctx.profile.id,
    set_at: now,
  }));

  const supabase = createClient();
  const { error } = await supabase
    .from('property_applicability')
    .upsert(rows, { onConflict: 'property_id,predicate' });
  if (error) {
    log.warn('wizard_applicability_failed', { propertyId, error: error.message });
    return { error: 'Could not save what this property has. Please try again.' };
  }

  await audit(supabase, {
    action: 'property.applicability_set',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property_applicability',
    metadata: { source: 'onboarding_wizard', applies: rows.filter((r) => r.applies).map((r) => r.predicate) },
  });

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return { applicable: rows.filter((r) => r.applies).map((r) => r.predicate) };
}

export interface WizardFinishState {
  error?: string;
  /** Plain-language note about what the document pass found, or did not. */
  notice?: string;
  proposalCount?: number;
  conflictCount?: number;
  done?: boolean;
}

/**
 * The final step: an optional document or pasted text, then finish.
 *
 * Everything the model extracts here is queued for review, never applied
 * (Boundary 4). When a finding contradicts something the host typed earlier in
 * this same wizard, that is surfaced explicitly in the notice — §2 requires the
 * host be told, not merely have it appear silently in a queue.
 */
export async function finishWizardAction(
  _prev: WizardFinishState,
  formData: FormData,
): Promise<WizardFinishState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };
  if (!hasServiceRole()) return { error: 'This is temporarily unavailable. Please try again later.' };

  const ctx = await requireSession();
  const admin = createAdminClient();
  const pasted = String(formData.get('pastedText') ?? '').slice(0, MAX_PASTE_CHARS).trim();
  const sourceRef = String(formData.get('sourceRef') ?? '').trim() || null;

  const finish = async () => {
    await audit(admin, {
      action: 'property.onboarding_completed',
      actorProfileId: ctx.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId,
      targetType: 'property',
      targetId: propertyId,
    });
  };

  if (pasted.length === 0) {
    await finish();
    return { done: true, proposalCount: 0, conflictCount: 0 };
  }

  const result = await deepIntake(admin, {
    propertyId,
    hostAccountId: access.property.host_account_id,
    actorProfileId: ctx.user.id,
    text: pasted,
    sourceType: 'text_paste',
    sourceRef,
    existingFieldIds: await loadAnsweredFieldIds(admin, propertyId),
  });

  await finish();
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);

  if (result.empty) {
    return {
      done: true,
      proposalCount: 0,
      conflictCount: 0,
      notice: 'We could not pull anything useful out of that text, so nothing was changed.',
    };
  }

  const filed = result.proposalIds.length;
  const conflicts = result.conflicts.length;
  const notice =
    conflicts > 0
      ? `We filed ${filed} item${filed === 1 ? '' : 's'} for your review. ${conflicts} disagree${conflicts === 1 ? 's' : ''} with an answer you gave earlier, so nothing was overwritten — you decide on the AI Updates tab.`
      : `We filed ${filed} item${filed === 1 ? '' : 's'} for your review on the AI Updates tab.`;

  return { done: true, proposalCount: filed, conflictCount: conflicts, notice };
}

type Admin = ReturnType<typeof createAdminClient>;

/** Predicates the host has asserted true. Absent and false are treated alike. */
async function loadAssertedPredicates(admin: Admin, propertyId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('property_applicability')
    .select('predicate, applies')
    .eq('property_id', propertyId);
  if (error) {
    // Failing closed here is the safe direction: an unread predicate list means
    // gated questions are dropped rather than saved against the wrong property.
    log.warn('wizard_predicates_failed', { propertyId, error: error.message });
    return [];
  }
  return (data ?? []).filter((r) => r.applies).map((r) => r.predicate);
}

/** field_ids the property already holds a live value for. Used only to mark conflicts. */
async function loadAnsweredFieldIds(admin: Admin, propertyId: string): Promise<string[]> {
  try {
    const values = await loadActiveValues(admin, propertyId);
    return values.map((v) => v.fieldId);
  } catch (err) {
    // Losing the conflict markers is a degraded review experience, not a reason to
    // refuse the import: the proposals still land for approval either way.
    log.warn('wizard_existing_fields_failed', { propertyId, error: String(err) });
    return [];
  }
}

/**
 * Reads one answer, composing sub-answers when the question declares them.
 *
 * Composed questions post `${fieldId}__${subKey}` alongside an optional free-text
 * `${fieldId}`. Composition runs server-side through the same `composeValue` the
 * wizard tests cover, so the stored sentence is identical no matter what the
 * client sent.
 */
function readAnswer(formData: FormData, q: WizardQuestion): string {
  const free = String(formData.get(q.fieldId) ?? '').trim();
  if (!q.compose || q.compose.length === 0) return free;

  const sub: Record<string, string> = {};
  for (const s of q.compose) sub[s.key] = String(formData.get(`${q.fieldId}__${s.key}`) ?? '');
  return composeValue(q, sub, free);
}

function intOrNull(v: FormDataEntryValue | null, min: number, max: number): number | null {
  const raw = String(v ?? '').trim();
  if (raw.length === 0) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}
