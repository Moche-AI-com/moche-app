'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePropertyAccess, requireSession } from '@/lib/auth/guards';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { audit } from '@/lib/audit';
import { APPLICABILITY_PREDICATES } from '@/lib/brain/completeness';
import { proposeFromLegacyNotes } from '@/lib/brain/legacy-migration';
import { log } from '@/lib/log';

export interface ApplicabilityState {
  error?: string;
  ok?: boolean;
}

/**
 * Records whether an applicability predicate holds for a property.
 *
 * This is the only input the host controls over the completeness denominator, so
 * it is worth being precise about what each state means:
 *   applies = true   -> the dependent fields join the scored set
 *   applies = false   -> the host has said "no pool"; the fields stay out
 *   no row            -> not yet asked; the fields also stay out
 *
 * false and absent score identically on purpose. Storing false anyway is what
 * lets the panel show the host which questions they have already answered
 * instead of asking again forever.
 */
export async function setApplicabilityAction(
  _prev: ApplicabilityState,
  formData: FormData,
): Promise<ApplicabilityState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const predicate = String(formData.get('predicate') ?? '');
  const applies = String(formData.get('applies') ?? '') === 'true';

  const [access, session] = await Promise.all([
    requirePropertyAccess(propertyId),
    requireSession(),
  ]);
  if (!access.can.editBrain) {
    return { error: 'You do not have permission to edit this property Brain.' };
  }
  // The database has the same check as a constraint. Validating here too keeps a
  // typo from becoming a 400 the host has to interpret.
  if (!APPLICABILITY_PREDICATES.includes(predicate)) {
    return { error: 'Unknown property feature.' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('property_applicability')
    .upsert(
      {
        property_id: propertyId,
        predicate,
        applies,
        set_by: session.profile.id,
        set_at: new Date().toISOString(),
      },
      { onConflict: 'property_id,predicate' },
    );
  if (error) return { error: 'Could not save that. Please try again.' };

  await audit(supabase, {
    action: 'property.applicability_set',
    propertyId,
    targetType: 'property_applicability',
    targetId: predicate,
    metadata: { predicate, applies },
  });

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return { ok: true };
}

export interface MigrationActionState {
  error?: string;
  message?: string;
}

/**
 * Turns the host's existing free-text notes into reviewable field proposals.
 *
 * Host-triggered rather than automatic: it writes to the same review queue the
 * host works through by hand, and filling that queue uninvited on every page load
 * would be a worse experience than a button they press once.
 *
 * Nothing is written to brain_values here. Every extracted value lands as a
 * pending proposal for the host to approve, modify, or deny (D-0011).
 */
export async function migrateLegacyNotesAction(
  _prev: MigrationActionState,
  formData: FormData,
): Promise<MigrationActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.editBrain) {
    return { error: 'You do not have permission to edit this property Brain.' };
  }
  // The scan reads every note on the property and writes to the review queue,
  // which RLS scopes to the host. It runs with the service role so a co-host with
  // partial row visibility cannot produce a partial, misleading scan.
  if (!hasServiceRole()) {
    return { error: 'This is temporarily unavailable. Please try again later.' };
  }

  try {
    const result = await proposeFromLegacyNotes(
      createAdminClient(),
      propertyId,
      access.property.host_account_id,
    );

    await audit(createClient(), {
      action: 'brain.legacy_migration_run',
      propertyId,
      targetType: 'proposed_updates',
      metadata: {
        scanned_notes: result.scannedNotes,
        candidates: result.candidates,
        inserted: result.inserted,
        skipped_existing: result.skippedExisting,
      },
    });
    revalidatePath(`/dashboard/properties/${propertyId}/brain`);

    if (result.inserted > 0) {
      return {
        message: `Found ${result.inserted} answer${result.inserted === 1 ? '' : 's'} in your notes. Review ${result.inserted === 1 ? 'it' : 'them'} in Pending updates.`,
      };
    }
    if (result.skippedExisting > 0) {
      return { message: 'Everything we could find in your notes is already answered or waiting for review.' };
    }
    return { message: 'Nothing we could match automatically. You can answer the questions above directly.' };
  } catch (err) {
    log.error('brain.legacy_migration_failed', { propertyId, error: String(err) });
    return { error: 'Could not scan your notes. Please try again.' };
  }
}
