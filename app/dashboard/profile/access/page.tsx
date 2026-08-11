import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { CAPABILITIES } from '@/lib/auth/member-capabilities';
import { roleLabel } from '@/lib/dashboard/roles';

export const dynamic = 'force-dynamic';

/**
 * Every property this person can reach, and exactly what they can do on each.
 *
 * Reads through the RLS client on purpose: the list is defined as "what this
 * session can see", so it can never over-report access the database would refuse.
 */
export default async function ProfileAccessPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const isOwner = ctx.account.owner_id === ctx.user.id;
  const currentRole = roleLabel({
    userId: ctx.user.id,
    accountOwnerId: ctx.account.owner_id,
    isAdmin: ctx.isFounder,
  });

  const [propsRes, membershipRes] = await Promise.all([
    supabase
      .from('properties')
      .select('id, display_name, status, city, region')
      .is('deleted_at', null)
      .order('display_name'),
    supabase
      .from('property_members')
      .select('property_id, role, can_edit_brain, can_reply_guests, can_receive_escalations, can_resolve_maintenance, can_view_analytics')
      .eq('profile_id', ctx.profile.id),
  ]);

  const allProperties = propsRes.data ?? [];
  const memberships = new Map(
    (membershipRes.data ?? []).map((m) => [m.property_id, m as Record<string, unknown>]),
  );
  // Members only see their assigned properties in this list. Owners and
  // account admins retain their accessible portfolio-wide view.
  const properties = isOwner || currentRole === 'Admin'
    ? allProperties
    : allProperties.filter((property) => memberships.has(property.id));

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Properties and access</h2>
        <span className="badge badge-teal" data-testid="access-role-badge">{currentRole}</span>
      </div>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 620 }}>
        {isOwner
          ? 'You own this account, so you have every permission on every property. Invited people appear with the role you gave them.'
          : currentRole === 'Admin'
            ? 'You are an admin, so your effective permissions apply across every accessible property.'
            : 'What you can do is set per property by the account owner.'}
      </p>

      {properties.length === 0 ? (
        <div className="card" style={{ padding: '1.5rem', textAlign: 'center', maxWidth: 620 }}>
          <p className="muted" style={{ fontSize: '.9rem', margin: '0 0 1rem' }}>
            No properties yet.
          </p>
          <Link href="/dashboard/properties/new" className="btn btn-primary btn-sm">
            Add your first property
          </Link>
        </div>
      ) : (
        <ul className="report-list" style={{ margin: 0, maxWidth: 680 }}>
          {properties.map((p) => {
            const m = memberships.get(p.id);
            const caps = isOwner || currentRole === 'Admin'
              ? CAPABILITIES.map((capability) => capability.label)
              : CAPABILITIES.filter((capability) => m?.[capability.key] === true).map((capability) => capability.label);
            const place = [p.city, p.region].filter(Boolean).join(', ');
            return (
              <li key={p.id} className="report-list-row">
                <div className="report-list-title" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link href={`/dashboard/properties/${p.id}`}>{p.display_name}</Link>
                  <span className="badge" style={{ fontSize: '.7rem' }}>
                    {currentRole}
                  </span>
                  {p.status !== 'live' && (
                    <span className="badge badge-coral" style={{ fontSize: '.7rem' }}>{p.status}</span>
                  )}
                </div>
                <div className="report-list-meta">{place || 'No address yet'}</div>
                <div className="muted" style={{ fontSize: '.83rem', marginTop: '.3rem' }}>
                  {caps.length > 0
                    ? caps.join(' · ')
                    : 'Read-only. You can see this property but not change it.'}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
