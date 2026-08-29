'use server';

// Server actions for Spaces & features (2026-08-28 directive). A feature is a custom
// Brain section with three structured inputs (where it is, whether guests may use it,
// notes). The AI only ever drafts — draftFeatureDescriptionAction returns text the
// host edits and then saves via saveFeatureAction — matching the standing rule that
// the AI never writes canonical Brain content without a human approve/save.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess, requireSession } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { routedCompletion } from '@/lib/router/modelRouter';
import { logAiUsage } from '@/lib/ai/usage';
import { FEATURE_CATALOG } from '@/lib/brain/taxonomy';

export interface FeatureActionState {
  error?: string;
  ok?: boolean;
  /** Present from draftFeatureDescriptionAction: proposed notes, never auto-saved. */
  draft?: string;
}

const GUEST_ACCESS = new Set(['yes', 'supervised', 'no']);

const ACCESS_COPY: Record<string, string> = {
  yes: 'guests may use it',
  supervised: 'guests may use it only with the host’s OK or supervision',
  no: 'not for guest use',
};

function catalogKeyFrom(formData: FormData): string | null {
  const raw = String(formData.get('catalogKey') ?? '').trim();
  if (!raw) return null;
  return FEATURE_CATALOG.some((e) => e.key === raw) ? raw : null;
}

// Create or update a feature. Update-in-place when featureId is present; create
// otherwise. Duplicate names are rejected by the partial unique index on
// (property_id, lower(label)) and surfaced as a friendly error.
export async function saveFeatureAction(
  _prev: FeatureActionState,
  formData: FormData,
): Promise<FeatureActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const featureId = String(formData.get('featureId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property Brain.' };

  const label = String(formData.get('label') ?? '').trim().slice(0, 80);
  const location = String(formData.get('location') ?? '').trim().slice(0, 240) || null;
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 2000) || null;
  const accessRaw = String(formData.get('guestAccess') ?? 'yes');
  const guestAccess = GUEST_ACCESS.has(accessRaw) ? accessRaw : 'yes';
  if (!label) return { error: 'Give it a name — e.g. "Pool house".' };

  const ctx = await requireSession();
  const supabase = createClient();

  if (featureId) {
    const { error } = await supabase
      .from('property_features')
      .update({
        label,
        location,
        notes,
        guest_access: guestAccess,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', featureId)
      .eq('property_id', propertyId);
    if (error) {
      if (error.code === '23505') return { error: 'You already have a feature with that name.' };
      log.warn('feature_update_failed', { error: error.message });
      return { error: 'Could not save that feature.' };
    }
  } else {
    const { error } = await supabase
      .from('property_features')
      .insert({
        property_id: propertyId,
        label,
        location,
        notes,
        guest_access: guestAccess,
        catalog_key: catalogKeyFrom(formData),
        created_by: ctx.user.id,
        created_via: 'host',
      } as never)
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return { error: 'You already have a feature with that name.' };
      log.warn('feature_create_failed', { error: error.message });
      return { error: 'Could not add that feature.' };
    }
  }

  await audit(supabase, {
    action: featureId ? 'brain.feature.updated' : 'brain.feature.created',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property_feature',
    targetId: featureId || label,
  });

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return { ok: true };
}

// Bulk-add from the onboarding checklist (2026-08-28). One tap per catalog entry the
// host toggled; details come later on the Brain page. Rows insert one at a time so a
// name the property already has (the partial unique index) skips instead of aborting
// the batch — revisiting onboarding stays idempotent.
export async function addFeaturesFromChecklistAction(
  _prev: FeatureActionState,
  formData: FormData,
): Promise<FeatureActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property Brain.' };

  const keys = formData.getAll('keys').map(String);
  const entries = FEATURE_CATALOG.filter((e) => keys.includes(e.key));
  if (entries.length === 0) return { ok: true };

  const ctx = await requireSession();
  const supabase = createClient();

  for (const entry of entries) {
    const { error } = await supabase
      .from('property_features')
      .insert({
        property_id: propertyId,
        label: entry.label,
        catalog_key: entry.key,
        created_by: ctx.user.id,
        created_via: 'host',
      } as never);
    if (error && error.code === '23505') continue;
    if (error) log.warn('feature_checklist_insert_failed', { propertyId, key: entry.key, error: error.message });
  }

  await audit(supabase, {
    action: 'brain.features.checklist_added',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return { ok: true };
}

// Archive, never delete: knowledge filed under the feature keeps its feature_id and
// stays retrievable by the concierge; the feature disappears from pickers and the
// routing guide until it is re-added.
export async function archiveFeatureAction(formData: FormData): Promise<void> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const featureId = String(formData.get('featureId') ?? '');
  if (!featureId) return;
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return;
  const ctx = await requireSession();
  const supabase = createClient();

  const now = new Date().toISOString();
  await supabase
    .from('property_features')
    .update({ archived_at: now, updated_at: now } as never)
    .eq('id', featureId)
    .eq('property_id', propertyId);

  await audit(supabase, {
    action: 'brain.feature.archived',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property_feature',
    targetId: featureId,
  });
  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
}

const DRAFT_SYSTEM = `You draft concise, guest-safe notes for a short-term-rental feature (pool, grill, EV charger...).
Write 2-4 short sentences a concierge can relay: what it is, where it is, how/when guests may use it, and any safety or etiquette note.
Never invent rules the host did not state or imply — if access is "ask host", say so. Plain text, no headings, under 80 words.`;

// "Draft with AI": propose concierge notes from the structured inputs. Runs on the
// brain_ops tier because the saved result becomes canonical Brain content. Returns a
// draft only — persistence is the host clicking Save on the same form.
export async function draftFeatureDescriptionAction(
  _prev: FeatureActionState,
  formData: FormData,
): Promise<FeatureActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property Brain.' };

  const label = String(formData.get('label') ?? '').trim().slice(0, 80);
  if (!label) return { error: 'Name it first so the draft knows what it is.' };
  const location = String(formData.get('location') ?? '').trim().slice(0, 240);
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 2000);
  const accessRaw = String(formData.get('guestAccess') ?? 'yes');
  const guestAccess = GUEST_ACCESS.has(accessRaw) ? accessRaw : 'yes';

  const started = Date.now();
  let result;
  try {
    result = await routedCompletion(
      [
        { role: 'system', content: DRAFT_SYSTEM },
        {
          role: 'user',
          content:
            `Feature: ${label}\nWhere: ${location || '(not stated)'}\nGuest access: ${ACCESS_COPY[guestAccess]}\nHost notes: ${notes || '(none)'}\n\nDraft the concierge notes.`,
        },
      ],
      { temperature: 0.4, maxTokens: 220 },
      { task: 'brain_ops' },
    );
  } catch (e) {
    log.warn('feature_draft_failed', { error: String(e) });
    return { error: 'The draft failed. You can still write the notes yourself.' };
  }

  const admin = createAdminClient();
  // Fire-and-forget cost logging, same as the other brain_ops callers.
  void logAiUsage(admin, {
    propertyId,
    kind: 'chat',
    model: result.model,
    promptTokens: result.usage?.promptTokens,
    completionTokens: result.usage?.completionTokens,
    latencyMs: Date.now() - started,
    source: 'feature_draft',
  });

  const draft = (result.text ?? '').trim();
  if (!draft) return { error: 'No draft came back — try again or write it yourself.' };
  return { ok: true, draft };
}
