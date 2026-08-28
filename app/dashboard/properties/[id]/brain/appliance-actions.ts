'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { routedCompletion } from '@/lib/router/modelRouter';
import { logAiUsage } from '@/lib/ai/usage';
import { ingestText } from '@/lib/ingest/pipeline';
import { log } from '@/lib/log';

export interface ApplianceState {
  error?: string;
  ok?: boolean;
  preview?: string;
  brainItemId?: string;
}

// ---------------------------------------------------------------------------
// C2 — Appliance auto-lookup.
// Host types a make/model (e.g. "Keurig K-Elite", "GE Profile dishwasher
// PDT715SYNFS"). One brain_ops-tier call returns concise, guest-safe operating +
// troubleshooting Q&A, which we ingest as a guest-visible brain_item so the
// concierge can answer appliance questions. Host can add their own notes.
//
// Tier rationale (2026-08-28): the generated text becomes canonical Brain content
// after host review, so it runs on the strong, no-downgrade brain_ops tier rather
// than 'general' — wrong appliance instructions are a guest-safety problem, not
// just a quality one.
// ---------------------------------------------------------------------------

const SYSTEM = `You write short, practical guest-facing help for household appliances in a short-term rental.
Given an appliance make/model, produce operating + troubleshooting guidance a guest can follow WITHOUT calling the host.
Rules:
- Be specific to the model when you are confident; if unsure about a model-specific detail, give the common/general behavior and say so briefly.
- Cover: how to turn on / basic use, the 3-5 most common problems and fixes, and any simple reset.
- NEVER invent part numbers, warranty terms, or dangerous electrical/gas repair steps. For anything unsafe, tell the guest to contact the host.
- Output GitHub-flavored Markdown: a short intro line, then "## Common questions" with **Q:** / **A:** pairs. Keep it under ~250 words.`;

export async function lookupApplianceAction(
  _prev: ApplianceState,
  formData: FormData,
): Promise<ApplianceState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };

  const model = String(formData.get('model') ?? '').trim();
  if (!model || model.length < 3) return { error: 'Enter an appliance make and model.' };
  if (model.length > 160) return { error: 'That is too long — just the make and model.' };

  const started = Date.now();
  let result;
  try {
    result = await routedCompletion(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Appliance: ${model}` },
      ],
      { temperature: 0.3, maxTokens: 700 },
      { task: 'brain_ops' },
    );
  } catch (e) {
    log.warn('appliance_lookup_failed', { error: String(e) });
    return { error: 'The lookup failed. Try again in a moment.' };
  }

  const admin = createAdminClient();
  // Fire-and-forget cost logging.
  void logAiUsage(admin, {
    propertyId,
    kind: 'chat',
    model: result.model,
    promptTokens: result.usage?.promptTokens,
    completionTokens: result.usage?.completionTokens,
    latencyMs: Date.now() - started,
    source: 'appliance_lookup',
  });

  const text = (result.text ?? '').trim();
  if (!text) return { error: 'No guidance was generated. Try rephrasing the model.' };
  return { ok: true, preview: text };
}

// Save the reviewed guidance (optionally with the host's own note) into the Brain.
export async function saveApplianceAction(
  _prev: ApplianceState,
  formData: FormData,
): Promise<ApplianceState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) return { error: 'You do not have permission to edit this property.' };

  const model = String(formData.get('model') ?? '').trim();
  const guidance = String(formData.get('guidance') ?? '').trim();
  const hostNote = String(formData.get('host_note') ?? '').trim();
  if (!model || !guidance) return { error: 'Missing appliance details.' };

  const body = hostNote
    ? `${guidance}\n\n## Host note\n${hostNote}`
    : guidance;

  const admin = createAdminClient();
  try {
    const res = await ingestText(admin, {
      propertyId,
      title: `Appliance: ${model}`.slice(0, 200),
      text: body,
      category: 'appliances',
      visibility: 'guest',
      sourceType: 'host_qa',
      kind: 'document',
    });
    revalidatePath(`/dashboard/properties/${propertyId}/brain`);
    return { ok: true, brainItemId: res.brainItemId };
  } catch (e) {
    log.warn('appliance_save_failed', { error: String(e) });
    return { error: 'Could not save that to your Brain. Try again.' };
  }
}
