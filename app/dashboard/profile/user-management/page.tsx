import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { UserManagementClient, type ManagedMember, type PendingInvite } from './UserManagementClient';

export const dynamic = 'force-dynamic';

/**
 * Owner-only roster. The owner check happens before the service-role reads:
 * property member names/emails are sensitive account data and must never be
 * retrieved merely because a caller can construct this route URL.
 */
export default async function UserManagementPage() {
  const ctx = await requireSession();
  if (ctx.account.owner_id !== ctx.user.id) redirect('/dashboard/profile');

  if (!hasServiceRole()) {
    return (
      <section>
        <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>User management</h2>
        <div className="alert alert-error" role="alert">
          User management is temporarily unavailable. Please try again shortly.
        </div>
      </section>
    );
  }

  const admin = createAdminClient();
  const [{ data: properties }, { data: invites }] = await Promise.all([
    admin
      .from('properties')
      .select('id, display_name')
      .eq('host_account_id', ctx.account.id)
      .is('deleted_at', null)
      .order('display_name'),
    admin
      .from('member_invites')
      .select('*')
      .eq('host_account_id', ctx.account.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);

  const propertyRows = properties ?? [];
  const propertyIds = propertyRows.map((property) => property.id);
  const propertyNameById = new Map(propertyRows.map((property) => [property.id, property.display_name]));
  const { data: memberships } = propertyIds.length
    ? await admin
        .from('property_members')
        .select('*')
        .in('property_id', propertyIds)
    : { data: [] };
  const profileIds = [...new Set((memberships ?? []).map((membership) => membership.profile_id))];
  const { data: profiles } = profileIds.length
    ? await admin.from('profiles').select('id, email, full_name').in('id', profileIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  const grouped = new Map<string, ManagedMember>();
  for (const membership of memberships ?? []) {
    const profile = profileById.get(membership.profile_id);
    if (!profile) continue;
    const propertyName = propertyNameById.get(membership.property_id);
    const existing = grouped.get(membership.profile_id);
    if (existing) {
      if (propertyName) existing.properties.push({ id: membership.property_id, name: propertyName });
      continue;
    }
    grouped.set(membership.profile_id, {
      profileId: membership.profile_id,
      email: profile.email,
      name: profile.full_name?.trim() || null,
      role: membership.role,
      capabilities: {
        can_edit_brain: membership.can_edit_brain,
        can_reply_guests: membership.can_reply_guests,
        can_receive_escalations: membership.can_receive_escalations,
        can_resolve_maintenance: membership.can_resolve_maintenance,
        can_view_analytics: membership.can_view_analytics,
      },
      properties: propertyName ? [{ id: membership.property_id, name: propertyName }] : [],
    });
  }

  const pendingInvites: PendingInvite[] = (invites ?? []).map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at,
    capabilities: {
      can_edit_brain: invite.can_edit_brain,
      can_reply_guests: invite.can_reply_guests,
      can_receive_escalations: invite.can_receive_escalations,
      can_resolve_maintenance: invite.can_resolve_maintenance,
      can_view_analytics: invite.can_view_analytics,
    },
    propertyIds: invite.property_ids,
  }));

  return (
    <UserManagementClient
      accountName={ctx.account.name}
      properties={propertyRows.map((property) => ({ id: property.id, name: property.display_name }))}
      members={[...grouped.values()].sort((a, b) => a.email.localeCompare(b.email))}
      invites={pendingInvites}
    />
  );
}
