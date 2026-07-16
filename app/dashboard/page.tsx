import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements } from '@/lib/billing/entitlements';
import { computeBrainHealth } from '@/lib/brain/health';

export const dynamic = 'force-dynamic';

function Stat({ label, value, href, accent }: { label: string; value: number | string; href?: string; accent?: boolean }) {
  const inner = (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div className="muted" style={{ fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '.35rem', color: accent ? 'var(--coral)' : 'var(--text)' }}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
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
  if (propertyIds.length > 0) {
    const [{ count: stayCount }, { data: brainItems }] = await Promise.all([
      supabase.from('stays').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('status', 'active'),
      supabase.from('brain_items').select('category, status, deleted_at, visibility, property_id').in('property_id', propertyIds),
    ]);
    activeStays = stayCount ?? 0;
    for (const pid of propertyIds) {
      const items = (brainItems ?? []).filter((b) => b.property_id === pid);
      brainByProperty.set(pid, computeBrainHealth(items).score);
    }
  }

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
          You&apos;re on the free build tier ({ent.propertyLimit} property). <Link href="/dashboard/billing" className="gradient-text" style={{ fontWeight: 600 }}>Choose a plan</Link> to publish more properties and unlock co-hosts, cloning, and review nudges.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Stat label="Properties" value={properties?.length ?? 0} href="/dashboard/properties" />
        <Stat label="Active stays" value={activeStays} />
        <Stat label="Open escalations" value={openEsc?.length ?? 0} href="/dashboard/escalations" accent={(openEsc?.length ?? 0) > 0} />
        <Stat label="Open service requests" value={services?.length ?? 0} href="/dashboard/service-requests" accent={(services?.length ?? 0) > 0} />
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
            return (
              <Link key={p.id} href={`/dashboard/properties/${p.id}`} className="card" style={{ padding: '1.25rem', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                  <strong>{p.display_name}</strong>
                  <span className={`badge ${p.status === 'live' ? 'badge-teal' : ''}`}>{p.status}</span>
                </div>
                <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>/{p.slug}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <div style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${health}%`, height: '100%', background: 'var(--grad)' }} />
                  </div>
                  <span className="muted" style={{ fontSize: '.8rem' }}>{health}% Brain</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
