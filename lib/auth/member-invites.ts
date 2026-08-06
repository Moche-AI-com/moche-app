import 'server-only';

import type { Database } from '@/lib/database.types';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { hashMemberInviteToken } from '@/lib/crypto';
import {
  isInvitableRole,
  type CapabilitySet,
  type InvitableRole,
} from '@/lib/auth/member-capabilities';

export type MemberInvite = Database['public']['Tables']['member_invites']['Row'];

export interface ResolvedMemberInvite {
  invite: MemberInvite;
  account: Database['public']['Tables']['host_accounts']['Row'];
  properties: Array<Pick<Database['public']['Tables']['properties']['Row'], 'id' | 'display_name'>>;
  capabilities: CapabilitySet;
  role: InvitableRole;
}

export type MemberInviteLookup =
  | { status: 'ready'; value: ResolvedMemberInvite }
  | { status: 'not_found' | 'revoked' | 'accepted' | 'expired' | 'unavailable' };

/**
 * Resolves an opaque invite token only on the server. The raw token never
 * reaches Supabase; a hash lookup keeps it out of logs, query traces, and
 * browser-readable APIs.
 */
export async function getMemberInviteByToken(token: string): Promise<MemberInviteLookup> {
  if (!hasServiceRole()) return { status: 'unavailable' };
  if (token.length < 32 || token.length > 256) return { status: 'not_found' };

  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from('member_invites')
    .select('*')
    .eq('token_hash', hashMemberInviteToken(token))
    .maybeSingle();
  if (error || !invite) return { status: 'not_found' };
  if (invite.revoked_at) return { status: 'revoked' };
  if (invite.accepted_at) return { status: 'accepted' };
  if (new Date(invite.expires_at).getTime() <= Date.now()) return { status: 'expired' };
  if (!isInvitableRole(invite.role)) return { status: 'not_found' };

  const { data: account, error: accountError } = await admin
    .from('host_accounts')
    .select('*')
    .eq('id', invite.host_account_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (accountError || !account) return { status: 'not_found' };

  const propertiesQuery = admin
    .from('properties')
    .select('id, display_name')
    .eq('host_account_id', invite.host_account_id)
    .is('deleted_at', null)
    .order('display_name');
  const { data: properties, error: propertiesError } =
    invite.property_ids.length > 0
      ? await propertiesQuery.in('id', invite.property_ids)
      : await propertiesQuery;
  if (propertiesError) return { status: 'unavailable' };

  return {
    status: 'ready',
    value: {
      invite,
      account,
      properties: properties ?? [],
      role: invite.role,
      capabilities: {
        can_edit_brain: invite.can_edit_brain,
        can_reply_guests: invite.can_reply_guests,
        can_receive_escalations: invite.can_receive_escalations,
        can_resolve_maintenance: invite.can_resolve_maintenance,
        can_view_analytics: invite.can_view_analytics,
      },
    },
  };
}
