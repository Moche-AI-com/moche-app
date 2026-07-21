import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements } from '@/lib/billing/entitlements';
import { computeBrainHealth } from '@/lib/brain/health';

export const dynamic = 'force-dynamic';

function Stat({
  label,
  value,
  href,
  icon,
  attn,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  icon: string;
  attn?: boolean;
  hint?: string;
}) {
  const inner = (
    <div className={`card card-interactive stat-card${attn ? ' stat-attn' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.7rem' }}>
        <span className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
        <span className="stat-icon" aria-hidden>{icon}</span>
      </div>
      <div style={{ fontSize: '2.1rem', fontWeight: 700, lineHeight: 1, color: attn ? 'var(--coral)' : 'var(--text)' }}>{value}</div>
      {hint && <div className="faint" style={{ fontSize: '.76rem', marginTop: '.45rem' }}>{hint}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ display: 'block' }}>{inner}</Link> : inner;
}

export default async function DashboardHome() {
  const ctx = await requireSession();
  const supabase = createClient();
  const accountId = ctx.account.id;

  const [{ data: properties }, { data: openEsc }, { data: services }, ent] = await Promise.all([
    supabase.from('properties').select('id, display_name, slug, status').eq('host_account_id', accountId).is('deleted_at', null),
    supabase.from('escalations').select('id, property_id').eq('status', 'open'),
    supabase.from('service_requests').select('id').in('status', ['new', 'acknowledged', 'in_progress']),
    getEntitlements(supabase, accountId),
  ]);

  const propertyIds = (properties ?? []).map((p) => p.id);

  // Active stays across all accessible properties.
  let activeStays = 0;
  const brainByProperty = new Map<string, number>();
  const itemsByProperty = new Map<string, number>();
  if (propertyIds.length > 0) {
    const [{ count: stayCount }, { data: brainItems }] = await Promise.all([
      supabase.from('stays').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('status', 'active'),
      supabase.from('brain_items').select('category, status, deleted_at, visibility, property_id').in('property_id', propertyIds),
    ]);
    activeStays = stayCount ?? 0;
    for (const pid of propertyIds) {
      const items = (brainItems ?? []).filter((b) => b.property_id === pid);
      brainByProperty.set(pid, computeBrainHealth(items).score);
      itemsByProperty.set(pid, items.filter((b) => !b.deleted_at).length);
    }
  }

  const escCount = openEsc?.length ?? 0;
  const svcCount = services?.length ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Overview</h1>
          <p className="muted">Welcome back, {ctx.profile.full_name ?? 'host'}.</p>
        </div>
        <Link href="/dashboard/properties/new" className="btn btn-primary">+ New property</Link>
      </div>

      {!ent.active && (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          You&apos;re on the free build tier ({ent.propertyLimit} property). <Link href="/dashboard/billing" className="gradient-text" style={{ fontWeight: 600 }}>Choose a plan</Link> to publish more properties and unlock concierge personality control, co-hosts, cloning, and review nudges.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="rise-in"><Stat label="Properties" value={properties?.length ?? 0} href="/dashboard/properties" icon="🏠" hint="View all" /></div>
        <div className="rise-in"><Stat label="Active stays" value={activeStays} icon="🛎️" hint={activeStays === 0 ? 'No guests in-house' : 'Guests in-house now'} /></div>
        <div className="rise-in"><Stat label="Open escalations" value={escCount} href="/dashboard/escalations" icon="⚠️" attn={escCount > 0} hint={escCount > 0 ? 'Needs your attention' : 'All clear'} /></div>
        <div className="rise-in"><Stat label="Service requests" value={svcCount} href="/dashboard/service-requests" icon="🔧" attn={svcCount > 0} hint={svcCount > 0 ? 'Awaiting action' : 'Nothing pending'} /></div>
      </div>

      <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Your properties</h2>
      {(properties?.length ?? 0) === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: '1rem' }}>No properties yet. Create your first Property Brain to get started.</p>
          <Link href="/dashboard/properties/new" className="btn btn-primary">Create a property</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1rem' }}>
          {properties!.map((p) => {
            const health = brainByProperty.get(p.id) ?? 0;
            const items = itemsByProperty.get(p.id) ?? 0;
            const tier = health >= 70 ? 'var(--teal)' : health >= 40 ? 'var(--iris)' : 'var(--coral)';
            return (
              <Link key={p.id} href={`/dashboard/properties/${p.id}`} className="card card-interactive rise-in" style={{ padding: '1.25rem', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                  <strong style={{ fontSize: '1.02rem' }}>{p.display_name}</strong>
                  <span className={`badge ${p.status === 'live' ? 'badge-teal' : 'badge-coral'}`}>{p.status}</span>
                </div>
                <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.9rem' }}>/{p.slug}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                  <span className="faint" style={{ fontSize: '.76rem' }}>{items} knowledge item{items === 1 ? '' : 's'}</span>
                  <span style={{ fontSize: '.78rem', fontWeight: 600, color: tier }}>{health}% Brain</span>
                </div>
                <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(health, 3)}%`, height: '100%', background: health >= 70 ? 'var(--grad)' : tier, transition: 'width 600ms var(--ease-out)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '.3rem', marginTop: '.9rem', color: 'var(--teal)', fontSize: '.8rem', fontWeight: 600 }}>
                  Open <span aria-hidden>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
