import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getEntitlements } from '@/lib/billing/entitlements';
import { planBannerFor } from '@/lib/dashboard/plan-banner';
import { computeBrainHealth } from '@/lib/brain/health';
import { loadValueMetrics, loadGuestFeedback } from '@/lib/dashboard/overview';
import { loadActivityTrend, loadTopTopics, loadActivityFeed } from '@/lib/dashboard/insights';
import { ValueHero, ValueMetricsGrid, GuestFeedbackPanel } from './DashboardOverview';
import { AttentionStrip, ActivityTrendCard, TopTopicsCard, ActivityFeedCard } from './DashboardInsights';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { ExtrasRequestsCard, type ExtrasRequestRow } from '@/components/dashboard/ExtrasRequestsCard';
import { UpdateQueueCard, type UpdateQueueCardRow } from '@/components/dashboard/UpdateQueueCard';
import { queueSummary } from '@/lib/brain/proposals';

export const dynamic = 'force-dynamic';

// Guest "Enhancement request:" escalations are how Extras requests actually land today
// (see app/api/guest/[slug]/extras-request/route.ts — it reuses the escalations pipeline
// rather than a dedicated table). This prefix is the only signal that distinguishes an
// Extras request from an ordinary guest question inside that same table.
const EXTRAS_REQUEST_PREFIX = 'Enhancement request:';

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: { property?: string };
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const accountId = ctx.account.id;

  // RLS decides what this query can ever return — a non-admin member simply never
  // receives a row for a property they don't belong to, admin-ness or not. We only
  // additionally scope by host_account_id to match the account-level query every
  // other dashboard page already uses (see app/dashboard/properties/page.tsx,
  // app/dashboard/escalations/page.tsx, app/dashboard/service-requests/page.tsx).
  const [{ data: allProperties }, { data: openEsc }, { data: services }, ent] = await Promise.all([
    supabase.from('properties').select('id, display_name, slug, status').eq('host_account_id', accountId).is('deleted_at', null),
    supabase.from('escalations').select('id, property_id').eq('status', 'open'),
    supabase.from('service_requests').select('id, property_id').in('status', ['new', 'acknowledged', 'in_progress']),
    getEntitlements(supabase, accountId),
  ]);

  // Read-only (lapsed billing) has to win over the free-build message, so the
  // decision lives in one tested place rather than in the JSX.
  const planBanner = planBannerFor(ent);

  const allPropertyIds = (allProperties ?? []).map((p) => p.id);
  // The property filter is a URL search param (?property=<id>) so it survives a
  // refresh and is shareable. Only ever honored when it names a property this
  // query already returned — i.e. one RLS actually allowed — so the filter can
  // narrow the view but never widen it beyond what the user can see.
  const requestedFilter = searchParams.property ?? null;
  const activeFilter = requestedFilter && allPropertyIds.includes(requestedFilter) ? requestedFilter : null;

  const properties = activeFilter ? (allProperties ?? []).filter((p) => p.id === activeFilter) : allProperties;
  const propertyIds = activeFilter ? [activeFilter] : allPropertyIds;
  const propertyNames = new Map<string, string>((allProperties ?? []).map((p) => [p.id, p.display_name as string]));

  // Scope the two portfolio-wide counts to the active filter (computed from the
  // already-fetched, RLS-scoped rows rather than a second round trip).
  const scopedOpenEsc = activeFilter ? (openEsc ?? []).filter((e) => e.property_id === activeFilter) : openEsc;
  const scopedServices = activeFilter ? (services ?? []).filter((s) => s.property_id === activeFilter) : services;

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

  const escCount = scopedOpenEsc?.length ?? 0;
  const svcCount = scopedServices?.length ?? 0;

  // Value metrics, guest AI feedback, the insight panels, and Extras requests.
  // All admin-scoped to this host's own property IDs and all best-effort — a
  // failure in any one of them degrades to an empty state instead of blanking
  // the dashboard. Extras requests have no dedicated table (see the
  // EXTRAS_REQUEST_PREFIX comment above) so they're read straight out of
  // `escalations`, the same table/RLS the Escalations page already uses.
  const [metrics, feedback, trend, topics, feed, extrasEscalations, proposalRows] = await Promise.all([
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
    propertyIds.length > 0
      ? supabase
          .from('escalations')
          .select('id, property_id, status')
          .in('property_id', propertyIds)
          .ilike('question', `${EXTRAS_REQUEST_PREFIX}%`)
      : Promise.resolve({ data: [] as { id: string; property_id: string; status: string }[] }),
    // Pending AI drafts, for the review-queue tile. Only pending rows are read:
    // the tile answers "is anything waiting on me", not "what have I decided".
    propertyIds.length > 0
      ? supabase
          .from('proposed_updates')
          .select('id, property_id, status, created_at')
          .in('property_id', propertyIds)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; property_id: string; status: string; created_at: string }[] }),
  ]);

  // Low ratings worth a second look, from the recent feedback sample.
  const lowRatings = feedback.recent.filter((f) => f.rating != null && f.rating <= 2).length;

  // Group Extras requests per property for the summary card.
  const extrasByProperty = new Map<string, { count: number; openCount: number }>();
  for (const row of extrasEscalations.data ?? []) {
    const pid = row.property_id as string;
    const entry = extrasByProperty.get(pid) ?? { count: 0, openCount: 0 };
    entry.count += 1;
    if (row.status === 'open') entry.openCount += 1;
    extrasByProperty.set(pid, entry);
  }
  const extrasRequestRows: ExtrasRequestRow[] = (properties ?? [])
    .map((p) => {
      const entry = extrasByProperty.get(p.id) ?? { count: 0, openCount: 0 };
      return {
        propertyId: p.id,
        propertyName: p.display_name as string,
        count: entry.count,
        openCount: entry.openCount,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Review-queue summary. queueSummary() owns the wording so the tile, the
  // empty state, and any future banner cannot drift apart.
  const pendingProposals = (proposalRows.data ?? []) as Array<{ property_id: string; status: string; created_at: string }>;
  const proposalSummary = queueSummary(
    pendingProposals.map((r) => ({ status: r.status as 'pending', created_at: r.created_at })),
  );
  const pendingByProperty = new Map<string, number>();
  for (const row of pendingProposals) {
    pendingByProperty.set(row.property_id, (pendingByProperty.get(row.property_id) ?? 0) + 1);
  }
  const updateQueueRows: UpdateQueueCardRow[] = (properties ?? [])
    .map((p) => ({
      propertyId: p.id,
      propertyName: p.display_name as string,
      pending: pendingByProperty.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.pending - a.pending);

  const hostName = (ctx.profile.full_name ?? '').split(' ')[0] ?? '';

  // Stays and Brain are per-property pages — with exactly one property we can
  // deep-link straight into it; with zero or multiple, send hosts to the
  // property picker instead of guessing which one they mean.
  const singlePropertyId = propertyIds.length === 1 ? propertyIds[0] : null;
  const activeStaysHref = singlePropertyId ? `/dashboard/properties/${singlePropertyId}/stays` : '/dashboard/properties';
  const knowledgeItemsHref = singlePropertyId ? `/dashboard/properties/${singlePropertyId}/brain` : '/dashboard/properties';

  const filterOptions = (allProperties ?? []).map((p) => ({ id: p.id, name: p.display_name as string }));

  return (
    <div className="dash-overview">
      <div className="dash-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <PropertyFilter properties={filterOptions} activeId={activeFilter} basePath="/dashboard" />
        <Link href="/dashboard/properties/new" className="btn dash-newbtn">
          <span className="dash-newbtn-icon" aria-hidden>
            <Plus size={14} aria-hidden />
          </span>
          New property
        </Link>
      </div>

      <ValueHero hostName={hostName} metrics={metrics} />

      {planBanner ? (
        // No marginTop: .dash-overview already supplies --gap-section between
        // its children, and stacking a margin on top of that is what made the
        // vertical rhythm jump.
        <div className={`alert alert-${planBanner.tone}`} data-testid={`plan-banner-${planBanner.variant}`}>
          <strong style={{ display: 'block', marginBottom: '.2rem' }}>{planBanner.title}</strong>
          {planBanner.body}{' '}
          <Link href={planBanner.ctaHref} className="gradient-text" style={{ fontWeight: 600 }}>
            {planBanner.ctaLabel}
          </Link>
        </div>
      ) : null}

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
          <UpdateQueueCard rows={updateQueueRows} detail={proposalSummary.detail} pending={proposalSummary.pending} />
          <ExtrasRequestsCard rows={extrasRequestRows} />
          <GuestFeedbackPanel feedback={feedback} />
        </div>
      </div>
    </div>
  );
}
