import 'server-only';

// Writing a value the HOST typed (directive §2, onboarding wizard).
//
// BOUNDARY 4 — WHY THIS IS NOT A PROPOSAL, STATED EXPLICITLY
// AGENTS.md Boundary 4: "Never publish content to the Property Brain without a
// proposed_update and human approval." That boundary governs content the AGENT or
// a MODEL produced. Every value this module writes was typed into a form field by
// the signed-in host during onboarding. Routing it through proposed_updates would
// mean asking the host to approve their own keystrokes, which is not review — it
// is a second click on the same decision, and it is the exact "jumping back and
// forth" the owner ruled out.
//
// This is not a new precedent. Two already exist in this repo:
//   lib/brain/setup-autofill.ts  — "Initial setup is the one deliberate exception
//                                  to the draft-then-approve workflow."
//   EnhanceBrainPanel (Phase B)  — "a host typing their own check-out time is the
//                                  reviewer."
// The wizard is the same case as both: initial setup, host-authored.
//
// WHAT STILL GOES THROUGH THE QUEUE
// Anything a model produced. The wizard's final document/paste step (§2) hands its
// text to an extraction model, and every field that pass proposes lands in
// proposed_updates for review — including any that would overwrite a value the
// host already typed earlier in the same wizard. See lib/onboarding/deep-intake.ts.
//
// WHAT THIS MODULE REFUSES
//   - a field_id the registry does not define
//   - a system_section field (never host-editable)
//   - a value that fails the registry's own type validation
//   - a write with no actor: brain_values rows are stamped 'host_verified', and an
//     unattributable claim of host verification is worse than no row.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { registryProposableField, normalizeProposedValue } from '@/lib/brain/proposals';
import { setSecretValue, registryField } from '@/lib/brain/values';
import { log } from '@/lib/log';

type Admin = SupabaseClient<Database>;

export interface HostValueInput {
  propertyId: string;
  fieldId: string;
  /** Raw form value. Validated here; never trusted because it came from a form. */
  raw: string;
  actorProfileId: string;
}

export type HostValueResult =
  | { ok: true; fieldId: string; targetId: string | null; secret: boolean }
  | { ok: false; fieldId: string; error: string };

export async function setHostValue(admin: Admin, input: HostValueInput): Promise<HostValueResult> {
  const field = registryField(input.fieldId);
  if (!field) {
    return { ok: false, fieldId: input.fieldId, error: 'That detail is not something this version can save.' };
  }
  if (field.system_section) {
    return { ok: false, fieldId: input.fieldId, error: 'That detail is managed automatically.' };
  }
  const trimmed = input.raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, fieldId: input.fieldId, error: 'That value cannot be empty.' };
  }

  // Secrets never touch the proposal shape and never come back out. The plaintext
  // is handed straight to the Vault RPC and is not returned, logged, or echoed —
  // Boundary 5 forbids it reaching telemetry, and this is the only call site in
  // the wizard path that holds one.
  if (field.type === 'secret') {
    if (trimmed.length > 400) {
      return { ok: false, fieldId: input.fieldId, error: 'Keep this under 400 characters.' };
    }
    try {
      const id = await setSecretValue(admin, {
        propertyId: input.propertyId,
        fieldId: input.fieldId,
        plaintext: trimmed,
        actorProfileId: input.actorProfileId,
      });
      return { ok: true, fieldId: input.fieldId, targetId: id, secret: true };
    } catch (e) {
      // The message from setSecretValue is already reduced to an error code, but
      // it is still not forwarded verbatim: a host cannot act on it.
      log.warn('wizard_secret_write_failed', { fieldId: input.fieldId, propertyId: input.propertyId });
      void e;
      return { ok: false, fieldId: input.fieldId, error: 'That could not be stored securely. Try again.' };
    }
  }

  // Non-secret values reuse the proposal validator rather than a parallel one, so
  // a time typed into the wizard and a time approved from the queue are held to
  // the identical contract.
  const proposable = registryProposableField(input.fieldId);
  if (!proposable) {
    return { ok: false, fieldId: input.fieldId, error: 'That detail is not something this version can save.' };
  }
  const normalized = normalizeProposedValue(proposable, trimmed);
  if (!normalized.ok) return { ok: false, fieldId: input.fieldId, error: normalized.error };

  const { data, error } = await admin.rpc('brain_values_set', {
    p_property_id: input.propertyId,
    p_field_id: input.fieldId,
    p_value: normalized.value as never,
    p_source: 'host_verified',
    p_confidence: 1,
    p_actor: input.actorProfileId,
  });
  if (error) {
    log.warn('wizard_value_write_failed', {
      fieldId: input.fieldId,
      propertyId: input.propertyId,
      code: error.code ?? 'unknown',
    });
    return { ok: false, fieldId: input.fieldId, error: 'That could not be saved. Try again.' };
  }
  return { ok: true, fieldId: input.fieldId, targetId: (data as string | null) ?? null, secret: false };
}

export interface HostValueBatchResult {
  saved: string[];
  /** field_id -> host-facing message. Rendered next to the field, not as a banner. */
  errors: Record<string, string>;
}

/**
 * Saves one wizard step.
 *
 * Sequential on purpose. `brain_values_set` supersedes the previous version of the
 * same field, and the wizard can legitimately send the same field twice if a host
 * navigates back and re-submits; serialising keeps the version chain in the order
 * the host actually typed. A step is at most a dozen fields, so the round trips
 * are not the bottleneck.
 *
 * A failed field does not abort the step. Losing eleven good answers because one
 * time was mistyped is the worst possible outcome for an onboarding form.
 */
export async function setHostValues(
  admin: Admin,
  input: { propertyId: string; actorProfileId: string; values: ReadonlyArray<{ fieldId: string; raw: string }> },
): Promise<HostValueBatchResult> {
  const saved: string[] = [];
  const errors: Record<string, string> = {};
  for (const v of input.values) {
    if (v.raw.trim().length === 0) continue; // skipped question, not an error
    const result = await setHostValue(admin, {
      propertyId: input.propertyId,
      fieldId: v.fieldId,
      raw: v.raw,
      actorProfileId: input.actorProfileId,
    });
    if (result.ok) saved.push(result.fieldId);
    else errors[result.fieldId] = result.error;
  }
  return { saved, errors };
}
