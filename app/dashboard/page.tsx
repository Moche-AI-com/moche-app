import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements } from '@/lib/billing/entitlements';
import { computeBrainHealth } from '@/lib/brain/health';
import { loadValueMetrics, loadGuestFeedback } from '@/lib/dashboard/overview';
import { ValueHero, ValueMetricsGrid, GuestFeedbackPanel } from './DashboardOverview';

export const dynamic = 'force-dynamic';

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
  const propertyNames = new Map<string, string>((properties ?? []).map((p) => [p.id, p.display_name as string]));

  // Active stays + per-property brain health across all accessible properties.
  let activeStays = 0;
  let totalKnowledge = 0;
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
      const liveCount = items.filter((b) => !b.deleted_at).length;
      itemsByProperty.set(pid, liveCount);
      totalKnowledge += liveCount;
    }
  }

  const escCount = openEsc?.length ?? 0;
  const svcCount = services?.length ?? 0;

  // Value metrics + guest AI feedback (admin-scoped to this host's properties).
  const [metrics, feedback] = await Promise.all([
    loadValueMetrics(supabase, propertyIds, {
      activeStays,
      openEscalations: escCount,
      openServiceRequests: svcCount,
      knowledgeItems: totalKnowledge,
    }),
    loadGuestFeedback(supabase, propertyIds, propertyNames),
  ]);

  const hostName = (ctx.profile.full_name ?? '').split(' ')[0] ?? '';

  // Stays and Brain are per-property pages — with exactly one property we can
  // deep-link straight into it; with zero or multiple, send hosts to the
  // property picker instead of guessing which one they mean.
  const singlePropertyId = propertyIds.length === 1 ? propertyIds[0] : null;
  const activeStaysHref = singlePropertyId ? `/dashboard/properties/${singlePropertyId}/stays` : '/dashboard/properties';
  const knowledgeItemsHref = singlePropertyId ? `/dashboard/properties/${singlePropertyId}/brain` : '/dashboard/properties';

  return (
    <div className="dash-overview">
      <div className="dash-topbar">
        <Link href="/dashboard/properties/new" className="btn btn-primary dash-newbtn">
          <Plus size={16} aria-hidden /> New property
        </Link>
      </div>

      <ValueHero hostName={hostName} metrics={metrics} />

      {!ent.active && (
        <div className="alert alert-info" style={{ marginTop: '1.25rem' }}>
          You&apos;re on the free build tier ({ent.propertyLimit} property).{' '}
          <Link href="/dashboard/billing" className="gradient-text" style={{ fontWeight: 600 }}>
            Choose a plan
          </Link>{' '}
          to publish more properties and unlock concierge personality control, co-hosts, cloning, and review nudges.
        </div>
      )}

      <ValueMetricsGrid metrics={metrics} activeStaysHref={activeStaysHref} knowledgeItemsHref={knowledgeItemsHref} />

      <div className="dash-two-col">
        <div className="dash-col-main">
          <div className="dash-section-head">
            <h2 className="dash-section-title">Your properties</h2>
            {(properties?.length ?? 0) > 0 && (
              <Link href="/dashboard/properties" className="dash-section-link">
                View all <ArrowUpRight size={14} aria-hidden />
              </Link>
            )}
          </div>

          {(properties?.length ?? 0) === 0 ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
              <p className="muted" style={{ marginBottom: '1rem' }}>
                No properties yet. Create your first Property Brain to get started.
              </p>
              <Link href="/dashboard/properties/new" className="btn btn-primary">
                Create a property
              </Link>
            </div>
          ) : (
            <div className="dash-props-grid">
              {properties!.map((p) => {
                const health = brainByProperty.get(p.id) ?? 0;
                const items = itemsByProperty.get(p.id) ?? 0;
                const tier = health >= 70 ? 'var(--teal)' : health >= 40 ? 'var(--iris)' : 'var(--coral)';
                return (
                  <Link key={p.id} href={`/dashboard/properties/${p.id}`} className="card card-interactive rise-in dash-prop-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
                      <strong style={{ fontSize: '1.02rem' }}>{p.display_name}</strong>
                      <span className={`badge ${p.status === 'live' ? 'badge-teal' : 'badge-coral'}`}>{p.status}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.9rem' }}>/{p.slug}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                      <span className="faint" style={{ fontSize: '.76rem' }}>
                        {items} knowledge item{items === 1 ? '' : 's'}
                      </span>
                      <span style={{ fontSize: '.78rem', fontWeight: 600, color: tier }}>{health}% Brain</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(health, 3)}%`, height: '100%', background: health >= 70 ? 'var(--grad)' : tier, transition: 'width 600ms var(--ease-out)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '.3rem', marginTop: '.9rem', color: 'var(--teal)', fontSize: '.8rem', fontWeight: 600 }}>
                      Open <ArrowUpRight size={14} aria-hidden />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="dash-col-side">
          <GuestFeedbackPanel feedback={feedback} />
        </div>
      </div>
    </div>
  );
}
