'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePropertyAccess, requireSession } from '@/lib/auth/guards';
import { log } from '@/lib/log';

export interface PurgeImportState {
  error?: string;
  message?: string;
}

/**
 * Deletes everything an import kept from a third-party listing: the captured page
 * text, the extracted draft, and the job rows holding the source URL.
 *
 * Deliberately not a property delete. The host keeps the property and anything
 * they have since approved into the Brain; what leaves is the copied source
 * material, which is the part Moche has no independent right to hold (D-0013).
 *
 * The RPC runs security invoker, so RLS on property_import_jobs — not this
 * function — decides whose imports a caller can reach.
 */
export async function purgeImportProvenanceAction(
  _prev: PurgeImportState,
  formData: FormData,
): Promise<PurgeImportState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  const [access, session] = await Promise.all([
    requirePropertyAccess(propertyId),
    requireSession(),
  ]);
  if (!access.can.editBrain) {
    return { error: 'You do not have permission to change this property.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('property_import_purge', {
    p_property_id: propertyId,
    p_actor: session.profile.id,
  });
  if (error) {
    log.error('property.import_purge_failed', { propertyId, error: error.message });
    return { error: 'Could not delete the imported source material. Please try again.' };
  }

  // The RPC returns a set; one row in practice, but treat it as a set so a future
  // per-job purge does not silently report the wrong count.
  const row = Array.isArray(data) ? data[0] : data;
  const jobs = row?.jobs_deleted ?? 0;

  revalidatePath(`/dashboard/properties/${propertyId}/brain`);
  return jobs > 0
    ? { message: 'Deleted the imported listing text and its source record.' }
    : { message: 'There was nothing left to delete.' };
}
