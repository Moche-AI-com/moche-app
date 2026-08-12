'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { passwordSchema } from '@/lib/validation';
import { getMemberInviteByToken, type ResolvedMemberInvite } from '@/lib/auth/member-invites';
import { hashMemberInviteToken } from '@/lib/crypto';
import { createUserAndSendConfirmation } from '@/lib/auth/auth-email';
import { recordAcceptances } from '@/lib/legal/acceptance';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface InviteAcceptanceState {
  error?: string;
  success?: string;
}

const existingUserAcceptanceSchema = z.object({
  acceptTerms: z.literal(true),
});

const newUserAcceptanceSchema = existingUserAcceptanceSchema.extend({
  password: passwordSchema,
});

function expiredMessage(): InviteAcceptanceState {
  return { error: 'This invitation has expired. Ask the account owner to send a fresh one.' };
}

async function memberPropertyRows(invite: ResolvedMemberInvite, profileId: string) {
  const admin = createAdminClient();
  const propertyIds =
    invite.invite.property_ids.length > 0
      ? invite.invite.property_ids
      : (
          await admin
            .from('properties')
            .select('id')
            .eq('host_account_id', invite.invite.host_account_id)
            .is('deleted_at', null)
        ).data?.map((property) => property.id) ?? [];

  // An empty property_ids array means all CURRENT account properties. Future
  // properties are not auto-granted by these rows; the product needs an explicit
  // follow-up policy/trigger before promising that behavior.
  if (propertyIds.length === 0) return { rows: [] as Array<{ property_id: string; profile_id: string }> };

  const { data: existing, error: existingError } = await admin
    .from('property_members')
    .select('property_id')
    .eq('profile_id', profileId)
    .in('property_id', propertyIds);
  if (existingError) return { error: 'Could not prepare property access.' };

  const existingIds = new Set((existing ?? []).map((membership) => membership.property_id));
  return {
    rows: propertyIds
      .filter((propertyId) => !existingIds.has(propertyId))
      .map((propertyId) => ({
        property_id: propertyId,
        profile_id: profileId,
        role: invite.role,
        ...invite.capabilities,
      })),
  };
}

async function claimAndGrantInvite(
  token: string,
  invite: ResolvedMemberInvite,
  profileId: string,
): Promise<InviteAcceptanceState | null> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  // This conditional update is the single-use gate. A concurrent second submit
  // receives no row and cannot create another set of memberships.
  const { data: claimed, error: claimError } = await admin
    .from('member_invites')
    .update({ accepted_at: now, accepted_profile_id: profileId })
    .eq('id', invite.invite.id)
    .eq('token_hash', hashMemberInviteToken(token))
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id')
    .maybeSingle();
  if (claimError) {
    log.warn('member_invite_claim_failed', { inviteId: invite.invite.id, error: claimError.message });
    return { error: 'We could not accept this invitation. Please try again.' };
  }
  if (!claimed) return { error: 'This invitation was already accepted, revoked, or expired.' };

  const rowsResult = await memberPropertyRows(invite, profileId);
  if ('error' in rowsResult) return { error: rowsResult.error };
  if (rowsResult.rows.length > 0) {
    const { error: membershipError } = await admin.from('property_members').insert(rowsResult.rows);
    if (membershipError) {
      // The invite remains consumed rather than allowing a token replay after a
      // partial failure. An audit event makes this visible for operator repair.
      log.error('member_invite_membership_insert_failed', {
        inviteId: invite.invite.id,
        profileId,
        error: membershipError.message,
      });
      return { error: 'Your invitation was accepted, but access setup needs help from support.' };
    }
  }

  const h = await headers();
  await recordAcceptances(admin, {
    userId: profileId,
    hostAccountId: invite.invite.host_account_id,
    context: 'invite',
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });
  await audit(admin, {
    action: 'member.invite.accepted',
    actorProfileId: profileId,
    hostAccountId: invite.invite.host_account_id,
    targetType: 'member_invite',
    targetId: invite.invite.id,
    metadata: { role: invite.role, capabilities: { ...invite.capabilities } },
  });
  return null;
}

/**
 * `token` is bound by the server component, never sent through a hidden input,
 * so the rendered form cannot expose or accidentally re-submit the raw token.
 */
export async function acceptInviteAction(
  token: string,
  _previous: InviteAcceptanceState,
  formData: FormData,
): Promise<InviteAcceptanceState> {
  const resolved = await getMemberInviteByToken(token);
  if (resolved.status === 'expired') return expiredMessage();
  if (resolved.status !== 'ready') {
    const messages: Record<Exclude<typeof resolved.status, 'ready'>, string> = {
      not_found: 'We could not find that invitation.',
      revoked: 'This invitation was revoked by the account owner.',
      accepted: 'This invitation has already been accepted.',
      unavailable: 'Invitation acceptance is temporarily unavailable. Please try again shortly.',
    };
    return { error: messages[resolved.status] };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const acceptTerms = formData.get('acceptTerms') === 'on';

  if (user) {
    const parsed = existingUserAcceptanceSchema.safeParse({ acceptTerms });
    if (!parsed.success) return { error: 'You must agree to the Terms of Service and Privacy Policy to accept.' };
    if (user.email?.trim().toLowerCase() !== resolved.value.invite.email.toLowerCase()) {
      return { error: 'Sign in with the email address this invitation was sent to.' };
    }

    const failure = await claimAndGrantInvite(token, resolved.value, user.id);
    if (failure) return failure;
    redirect('/dashboard');
  }

  const parsed = newUserAcceptanceSchema.safeParse({
    acceptTerms,
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Choose a password and accept the terms to continue.' };
  }
  if (!hasServiceRole()) {
    return { error: 'Invitation acceptance is temporarily unavailable. Please try again shortly.' };
  }

  const email = resolved.value.invite.email;
  const name = email.split('@')[0] || 'Invited member';
  const createResult = await createUserAndSendConfirmation(createAdminClient(), {
    email,
    password: parsed.data.password,
    data: {
      full_name: name,
      account_name: `${resolved.value.account.name} invited member`,
    },
  });
  if (!createResult.ok) {
    const reason = createResult.reason.toLowerCase();
    return {
      error: reason.includes('already') && reason.includes('regist')
        ? 'An account already exists for this invitation. Sign in with the invited email, then open this link again.'
        : 'We could not create your account just now. Please try again shortly.',
    };
  }

  const failure = await claimAndGrantInvite(token, resolved.value, createResult.userId);
  if (failure) return failure;
  return { success: 'Your account is ready. Check your email to confirm it, then sign in to access the properties.' };
}
