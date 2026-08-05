import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  co_host: 'Co-host',
  property_manager: 'Property manager',
  maintenance: 'Maintenance',
  cleaner: 'Cleaner',
  viewer: 'Viewer',
};

const CAPABILITY_LABEL: Array<{ key: string; label: string }> = [
  { key: 'can_edit_brain', label: 'Edit the Brain' },
  { key: 'can_reply_guests', label: 'Reply to guests' },
  { key: 'can_receive_escalations', label: 'Receive escalations' },
  { key: 'can_resolve_maintenance', label: 'Resolve maintenance' },
  { key: 'can_view_analytics', label: 'View analytics' },
];

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

  const properties = propsRes.data ?? [];
  const memberships = new Map(
    (membershipRes.data ?? []).map((m) => [m.property_id, m as Record<string, unknown>]),
  );

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Properties and access</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 620 }}>
        {isOwner
          ? 'You own this account, so you have every permission on every property. Invited people appear with the role you gave them.'
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
            const role = isOwner ? 'owner' : ((m?.role as string) ?? 'viewer');
            const caps = isOwner
              ? CAPABILITY_LABEL.map((c) => c.label)
              : CAPABILITY_LABEL.filter((c) => m?.[c.key] === true).map((c) => c.label);
            const place = [p.city, p.region].filter(Boolean).join(', ');
            return (
              <li key={p.id} className="report-list-row">
                <div className="report-list-title" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link href={`/dashboard/properties/${p.id}`}>{p.display_name}</Link>
                  <span className="badge" style={{ fontSize: '.7rem' }}>
                    {ROLE_LABEL[role] ?? role}
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
