import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements } from '@/lib/billing/entitlements';
import { computeBrainHealth } from '@/lib/brain/health';
import { loadValueMetrics, loadGuestFeedback } from '@/lib/dashboard/overview';
import { loadActivityTrend, loadTopTopics, loadActivityFeed } from '@/lib/dashboard/insights';
import { ValueHero, ValueMetricsGrid, GuestFeedbackPanel } from './DashboardOverview';
import { AttentionStrip, ActivityTrendCard, TopTopicsCard, ActivityFeedCard } from './DashboardInsights';

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
  // Upcoming arrivals — checking in within the next 3 days, soonest first.
  let upcomingCheckIns = 0;
  let nextArrival: { guestName: string; propertyName: string | null; checkIn: string } | null = null;
  if (propertyIds.length > 0) {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: stayCount }, { data: brainItems }, { data: arrivals }] = await Promise.all([
      supabase.from('stays').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('status', 'active'),
      supabase.from('brain_items').select('category, status, deleted_at, visibility, property_id').in('property_id', propertyIds),
      supabase
        .from('stays')
        .select('id, property_id, guest_display_name, check_in')
        .in('property_id', propertyIds)
        .in('status', ['upcoming', 'active'])
        .gte('check_in', new Date().toISOString())
        .lte('check_in', soon)
        .is('deleted_at', null)
        .order('check_in', { ascending: true }),
    ]);
    activeStays = stayCount ?? 0;
    for (const pid of propertyIds) {
      const items = (brainItems ?? []).filter((b) => b.property_id === pid);
      brainByProperty.set(pid, computeBrainHealth(items).score);
      const liveCount = items.filter((b) => !b.deleted_at).length;
      itemsByProperty.set(pid, liveCount);
      totalKnowledge += liveCount;
    }
    upcomingCheckIns = arrivals?.length ?? 0;
    const first = arrivals?.[0];
    if (first) {
      nextArrival = {
        guestName: (first.guest_display_name as string | null)?.trim() || 'A guest',
        propertyName: propertyNames.get(first.property_id as string) ?? null,
        checkIn: first.check_in as string,
      };
    }
  }

  // Portfolio-wide Brain health — average score + how many properties are lagging.
  const healthScores = [...brainByProperty.values()];
  const avgBrainHealthPct = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : null;
  const propertiesNeedingAttention = healthScores.filter((h) => h < 60).length;

  const escCount = openEsc?.length ?? 0;
  const svcCount = services?.length ?? 0;

  // Value metrics, guest AI feedback, and the insight panels. All admin-scoped to
  // this host's own property IDs and all best-effort — a failure in any one of
  // them degrades to an empty state instead of blanking the dashboard.
  const [metrics, feedback, trend, topics, feed] = await Promise.all([
    loadValueMetrics(supabase, propertyIds, {
      activeStays,
      openEscalations: escCount,
      openServiceRequests: svcCount,
      knowledgeItems: totalKnowledge,
    }),
    loadGuestFeedback(supabase, propertyIds, propertyNames),
    loadActivityTrend(supabase, propertyIds, 14),
    loadTopTopics(supabase, propertyIds, 5),
    loadActivityFeed(supabase, propertyIds, propertyNames, 8),
  ]);

  // Low ratings worth a second look, from the recent feedback sample.
  const lowRatings = feedback.recent.filter((f) => f.rating != null && f.rating <= 2).length;

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
        <Link href="/dashboard/properties/new" className="btn dash-newbtn">
          <span className="dash-newbtn-icon" aria-hidden>
            <Plus size={14} aria-hidden />
          </span>
          New property
        </Link>
      </div>

      <ValueHero hostName={hostName} metrics={metrics} />

      {!ent.active && (
        // No marginTop: .dash-overview already supplies --gap-section between
        // its children, and stacking a margin on top of that is what made the
        // vertical rhythm jump.
        <div className="alert alert-info">
          You&apos;re on the free build tier ({ent.propertyLimit} property).{' '}
          <Link href="/dashboard/billing" className="gradient-text" style={{ fontWeight: 600 }}>
            Choose a plan
          </Link>{' '}
          to publish more properties and unlock concierge personality control, co-hosts, cloning, and review nudges.
        </div>
      )}

      <AttentionStrip openEscalations={escCount} openServiceRequests={svcCount} lowRatings={lowRatings} />

      <ValueMetricsGrid
        metrics={metrics}
        activeStaysHref={activeStaysHref}
        knowledgeItemsHref={knowledgeItemsHref}
        upcomingCheckIns={upcomingCheckIns}
        nextArrival={nextArrival}
        avgBrainHealthPct={avgBrainHealthPct}
        propertiesNeedingAttention={propertiesNeedingAttention}
      />

      <div className="dash-insights-row">
        <ActivityTrendCard trend={trend} />
        <TopTopicsCard topics={topics} brainHref={knowledgeItemsHref} />
      </div>

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
            <div className="card" style={{ padding: '2.25rem var(--pad-card)', textAlign: 'center' }}>
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

        <div className="dash-col-side" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-section)' }}>
          <ActivityFeedCard events={feed} />
          <GuestFeedbackPanel feedback={feedback} />
        </div>
      </div>
    </div>
  );
}
