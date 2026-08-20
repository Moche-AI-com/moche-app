'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, type SessionContext } from '@/lib/auth/guards';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import {
  memberCapabilityUpdateSchema,
  memberInviteSchema,
} from '@/lib/validation';
import {
  isInvitableRole,
  normalizeCapabilities,
  type CapabilitySet,
} from '@/lib/auth/member-capabilities';
import { generateMemberInviteToken, hashMemberInviteToken } from '@/lib/crypto';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { sendMemberInvite } from '@/lib/auth/auth-email';
import { log } from '@/lib/log';

export interface MemberActionState {
  error?: string;
  success?: string;
}

const inviteIdSchema = z.string().uuid();
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LIVE_INVITES_PER_ACCOUNT = 25;
const MAX_INVITES_PER_HOUR = 10;

// Capabilities now arrive as a single JSON-serialized `capabilities` field from
// the client instead of individual can_* checkboxes. Parse it defensively and
// let normalizeCapabilities() validate the payload against the known keys —
// never trust the shape of the client-supplied object.
function capabilityFormValues(formData: FormData): unknown {
  const raw = formData.get('capabilities');
  if (raw === null) return {};
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function parseCapabilities(role: FormDataEntryValue | null, formData: FormData): CapabilitySet | null {
  const values = capabilityFormValues(formData);
  if (values === null) return null;
  try {
    return normalizeCapabilities(role, values);
  } catch {
    return null;
  }
}

async function ownerContext(): Promise<{ ctx: SessionContext } | { error: MemberActionState }> {
  const ctx = await requireSession();
  if (ctx.account.owner_id !== ctx.user.id) {
    return { error: { error: 'Only the account owner can manage people and invitations.' } };
  }
  if (!hasServiceRole()) {
    // Invitations are intentionally server-admin only; without this key, failing
    // closed is safer than falling back to an RLS path that could expose a hash.
    return { error: { error: 'User management is temporarily unavailable. Please try again shortly.' } };
  }
  return { ctx };
}

async function verifiedPropertyIds(
  accountId: string,
  submittedIds: string[],
): Promise<{ ids: string[] } | { error: string }> {
  const ids = [...new Set(submittedIds)];
  if (ids.length === 0) return { ids };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('properties')
    .select('id')
    .eq('host_account_id', accountId)
    .is('deleted_at', null)
    .in('id', ids);
  if (error || (data?.length ?? 0) !== ids.length) {
    return { error: 'Choose properties that belong to this account.' };
  }
  return { ids };
}

async function accountPropertyIds(accountId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('properties')
    .select('id')
    .eq('host_account_id', accountId)
    .is('deleted_at', null);
  if (error) {
    log.warn('member_properties_lookup_failed', { accountId, error: error.message });
    return [];
  }
  return (data ?? []).map((property) => property.id);
}

function inviteExpiryIso(): string {
  return new Date(Date.now() + INVITE_EXPIRY_MS).toISOString();
}

async function deliverInvite(input: {
  email: string;
  inviterName: string;
  accountName: string;
  role: Parameters<typeof sendMemberInvite>[0]['role'];
  capabilities: CapabilitySet;
  token: string;
}): Promise<boolean> {
  const sent = await sendMemberInvite(input);
  if (!sent) {
    log.warn('member_invite_email_failed', { accountName: input.accountName });
  }
  return sent;
}

export async function inviteMemberAction(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const owner = await ownerContext();
  if ('error' in owner) return owner.error;

  const rawRole = formData.get('role');
  const capabilities = parseCapabilities(rawRole, formData);
  if (!capabilities) return { error: 'Choose a valid role and actions.' };

  const parsed = memberInviteSchema.safeParse({
    email: formData.get('email'),
    role: rawRole,
    ...capabilities,
    propertyIds: formData.getAll('propertyIds').filter((id): id is string => typeof id === 'string'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the invitation details.' };

  const scope = await verifiedPropertyIds(owner.ctx.account.id, parsed.data.propertyIds);
  if ('error' in scope) return { error: scope.error };

  const admin = createAdminClient();

  const rate = await checkRateLimit(admin, {
    key: owner.ctx.account.id,
    limit: MAX_INVITES_PER_HOUR,
    windowSeconds: 60 * 60,
    action: 'member.invite.rate_limit',
  });
  if (!rate.allowed) {
    return { error: 'Too many invitations were sent recently. Please wait before trying again.' };
  }

  const now = new Date().toISOString();

  // Keep the table's one-live-invite invariant usable when a previous invite
  // naturally expires; it also makes the migration's immutable partial index
  // enforce the intended time-aware rule.
  await admin
    .from('member_invites')
    .update({ revoked_at: now })
    .eq('host_account_id', owner.ctx.account.id)
    .ilike('email', parsed.data.email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .lte('expires_at', now);

  const { count, error: liveCountError } = await admin
    .from('member_invites')
    .select('id', { count: 'exact', head: true })
    .eq('host_account_id', owner.ctx.account.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now);

  if (liveCountError) {
    log.warn('member_invite_count_failed', { accountId: owner.ctx.account.id, error: liveCountError.message });
    return { error: 'Could not prepare the invitation. Please try again.' };
  }

  if ((count ?? 0) >= MAX_LIVE_INVITES_PER_ACCOUNT) {
    return { error: 'This account already has 25 pending invitations. Revoke or wait for one to expire first.' };
  }

  const token = generateMemberInviteToken();
  const { data: invite, error } = await admin
    .from('member_invites')
    .insert({
      host_account_id: owner.ctx.account.id,
      email: parsed.data.email,
      role: parsed.data.role,
      ...capabilities,
      property_ids: scope.ids,
      invited_by: owner.ctx.profile.id,
      token_hash: hashMemberInviteToken(token),
      expires_at: inviteExpiryIso(),
    })
    .select('id')
    .single();

  if (error || !invite) {
    log.warn('member_invite_insert_failed', { accountId: owner.ctx.account.id, error: error?.message ?? 'missing invite' });
    return { error: 'Could not send this invitation. Please check the address and try again.' };
  }

  const sent = await deliverInvite({
    email: parsed.data.email,
    inviterName: owner.ctx.profile.full_name?.trim() || owner.ctx.profile.email,
    accountName: owner.ctx.account.name,
    role: parsed.data.role,
    capabilities,
    token,
  });

  await audit(admin, {
    action: 'member.invite.created',
    actorProfileId: owner.ctx.profile.id,
    hostAccountId: owner.ctx.account.id,
    targetType: 'member_invite',
    targetId: invite.id,
    metadata: { role: parsed.data.role, capabilities: { ...capabilities } },
  });

  revalidatePath('/dashboard/profile/user-management');

  // Identical success wording protects whether this email already has an account.
  return {
    success: sent
      ? 'Invitation sent. They can sign in or create an account from the same link.'
      : 'The invitation was created, but we could not send the email. Use Resend to try again.',
  };
}

export async function revokeInviteAction(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const owner = await ownerContext();
  if ('error' in owner) return owner.error;

  const inviteId = inviteIdSchema.safeParse(formData.get('inviteId'));
  if (!inviteId.success) return { error: 'This invitation is no longer valid.' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('member_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId.data)
    .eq('host_account_id', owner.ctx.account.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error || !data) return { error: 'This invitation could not be revoked.' };

  await audit(admin, {
    action: 'member.invite.revoked',
    actorProfileId: owner.ctx.profile.id,
    hostAccountId: owner.ctx.account.id,
    targetType: 'member_invite',
    targetId: data.id,
  });

  revalidatePath('/dashboard/profile/user-management');
  return { success: 'Invitation revoked.' };
}

export async function resendInviteAction(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const owner = await ownerContext();
  if ('error' in owner) return owner.error;

  const inviteId = inviteIdSchema.safeParse(formData.get('inviteId'));
  if (!inviteId.success) return { error: 'This invitation is no longer valid.' };

  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin
    .from('member_invites')
    .select('*')
    .eq('id', inviteId.data)
    .eq('host_account_id', owner.ctx.account.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle();

  if (inviteError || !invite) return { error: 'This invitation is no longer available to resend.' };

  if (!isInvitableRole(invite.role)) {
    log.error('member_invite_invalid_role', { inviteId: invite.id, role: invite.role });
    return { error: 'This invitation has an invalid role and cannot be resent.' };
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { error: 'This invitation has expired. Create a fresh invitation instead.' };
  }

  const rate = await checkRateLimit(admin, {
    key: owner.ctx.account.id,
    limit: MAX_INVITES_PER_HOUR,
    windowSeconds: 60 * 60,
    action: 'member.invite.rate_limit',
  });
  if (!rate.allowed) return { error: 'Too many invitations were sent recently. Please wait before trying again.' };

  const token = generateMemberInviteToken();
  const { data: updatedInvite, error: updateError } = await admin
    .from('member_invites')
    .update({
      token_hash: hashMemberInviteToken(token),
      expires_at: inviteExpiryIso(),
    })
    .eq('id', invite.id)
    .eq('host_account_id', owner.ctx.account.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();

  if (updateError || !updatedInvite) return { error: 'Could not refresh this invitation. Please try again.' };

  const capabilities: CapabilitySet = {
    can_edit_brain: invite.can_edit_brain,
    can_reply_guests: invite.can_reply_guests,
    can_receive_escalations: invite.can_receive_escalations,
    can_resolve_maintenance: invite.can_resolve_maintenance,
    can_view_analytics: invite.can_view_analytics,
  };

  const sent = await deliverInvite({
    email: invite.email,
    inviterName: owner.ctx.profile.full_name?.trim() || owner.ctx.profile.email,
    accountName: owner.ctx.account.name,
    role: invite.role,
    capabilities,
    token,
  });

  await audit(admin, {
    action: 'member.invite.resent',
    actorProfileId: owner.ctx.profile.id,
    hostAccountId: owner.ctx.account.id,
    targetType: 'member_invite',
    targetId: invite.id,
    metadata: { role: invite.role, capabilities: { ...capabilities } },
  });

  revalidatePath('/dashboard/profile/user-management');
  return sent
    ? { success: 'A fresh invitation link was sent.' }
    : { error: 'The invitation was refreshed, but the email could not be sent. Try again shortly.' };
}

export async function updateMemberCapabilitiesAction(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const owner = await ownerContext();
  if ('error' in owner) return owner.error;

  const rawRole = formData.get('role');
  const capabilities = parseCapabilities(rawRole, formData);
  if (!capabilities) return { error: 'Choose a valid role and actions.' };

  const parsed = memberCapabilityUpdateSchema.safeParse({
    profileId: formData.get('profileId'),
    role: rawRole,
    ...capabilities,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the member settings.' };

  const propertyIds = await accountPropertyIds(owner.ctx.account.id);
  if (propertyIds.length === 0) return { error: 'This account has no properties to update.' };

  const admin = createAdminClient();
  const { data: memberships, error: membershipError } = await admin
    .from('property_members')
    .select('id')
    .eq('profile_id', parsed.data.profileId)
    .in('property_id', propertyIds);

  if (membershipError || !memberships?.length) {
    return { error: 'This person does not have access on this account.' };
  }

  const { error } = await admin
    .from('property_members')
    .update({ role: parsed.data.role, ...capabilities })
    .eq('profile_id', parsed.data.profileId)
    .in('property_id', propertyIds);

  if (error) return { error: 'Could not update this member. Please try again.' };

  await audit(admin, {
    action: 'member.capabilities.updated',
    actorProfileId: owner.ctx.profile.id,
    hostAccountId: owner.ctx.account.id,
    targetType: 'profile',
    targetId: parsed.data.profileId,
    metadata: { role: parsed.data.role, capabilities: { ...capabilities } },
  });

  revalidatePath('/dashboard/profile/user-management');
  return { success: 'Member access updated.' };
}

export async function removeMemberAction(
  _previous: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const owner = await ownerContext();
  if ('error' in owner) return owner.error;

  const profileId = z.string().uuid().safeParse(formData.get('profileId'));
  if (!profileId.success) return { error: 'This member is no longer valid.' };

  const propertyIds = await accountPropertyIds(owner.ctx.account.id);
  if (propertyIds.length === 0) return { error: 'This account has no properties to update.' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('property_members')
    .delete()
    .eq('profile_id', profileId.data)
    .in('property_id', propertyIds)
    .select('id');

  if (error || !data?.length) return { error: 'This person could not be removed.' };

  await audit(admin, {
    action: 'member.removed',
    actorProfileId: owner.ctx.profile.id,
    hostAccountId: owner.ctx.account.id,
    targetType: 'profile',
    targetId: profileId.data,
    metadata: { removedPropertyMemberships: data.length },
  });

  revalidatePath('/dashboard/profile/user-management');
  return { success: 'Member access removed.' };
}
