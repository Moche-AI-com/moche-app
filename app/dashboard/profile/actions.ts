'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';
import { profileUpdateSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface ProfileFormState {
  error?: string;
  success?: string;
}

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const ctx = await requireSession();
  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check your details.' };

  const supabase = createClient();
  // Phone is deliberately NOT updated here — it is owned by the verified phone flow in
  // security-actions.ts so we never overwrite a verified number (and its consent state)
  // with an unverified one from this basic form.
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.user.id);

  if (error) {
    log.warn('profile_update_failed', { error: error.message });
    return { error: 'Could not save your profile. Please try again.' };
  }

  await audit(supabase, {
    action: 'profile.updated',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
  });
  revalidatePath('/dashboard/profile');
  return { success: 'Profile saved.' };
}

// Soft-delete: mark the profile and owned account for deletion, then sign out.
// A background job (Phase-2) performs the hard delete after the grace window.
export async function requestAccountDeletionAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const ctx = await requireSession();
  const confirm = String(formData.get('confirm') ?? '').trim().toLowerCase();
  if (confirm !== 'delete') {
    return { error: 'Type "delete" to confirm account deletion.' };
  }

  const supabase = createClient();
  const now = new Date().toISOString();

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ deletion_requested_at: now, updated_at: now })
    .eq('id', ctx.user.id);
  if (profileErr) {
    log.warn('account_deletion_failed', { error: profileErr.message });
    return { error: 'Could not process the deletion request. Please contact support.' };
  }

  // Only the owner can soft-delete the account itself.
  if (ctx.account.owner_id === ctx.user.id) {
    await supabase.from('host_accounts').update({ deleted_at: now, updated_at: now }).eq('id', ctx.account.id);
  }

  await audit(supabase, {
    action: 'account.deletion_requested',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'host_account',
    targetId: ctx.account.id,
  });

  await supabase.auth.signOut();
  redirect('/login?deleted=1');
}
