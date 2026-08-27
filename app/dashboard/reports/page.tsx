import Link from 'next/link';
import { Archive, FileText, Sparkles, Building2, MessageSquare, MessagesSquare, Users, Cpu } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string | string[] }>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  // Deliberately NOT filtered on `deleted_at`: permanently deleting a property
  // leaves a stripped tombstone (see lib/properties/purge.ts) precisely so
  // reports can still say which property they came from.
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, status, deleted_at')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');

  const allProps = properties ?? [];
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  // The filter and the report scope only offer properties that still exist.
  const propList = allProps.filter((p) => p.deleted_at === null);
  const archivedCount = propList.filter((p) => p.status === 'archived').length;

  // Only honour a property filter for a property this account actually owns.
  const requested = Array.isArray(sp.property) ? sp.property[0] : sp.property;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  // Exact per-topic totals for the cards. Head-only count queries are cheap and
  // stay accurate past the grids' 500-row fetch caps.
  let staysTotal = 0;
  let requestsTotal = 0;
  let extrasTotal = 0;
  let handledTotal = 0;
  let guestsTotal = 0;
  let conversationsTotal = 0;
  let aiUsageTotal = 0;

  if (scopeIds.length) {
    const [stayCountRes, reqCountRes, extrasCountRes, handledCountRes, guestsCountRes, convoCountRes] =
      await Promise.all([
        supabase
          .from('stays')
          .select('id', { count: 'exact', head: true })
          .in('property_id', scopeIds)
          .is('deleted_at', null)
          .eq('lifecycle_status', 'archived'),
        supabase
          .from('service_requests')
          .select('id', { count: 'exact', head: true })
          .in('property_id', scopeIds)
          .eq('lifecycle_status', 'archived'),
        supabase
          .from('extras_orders')
          .select('id', { count: 'exact', head: true })
          .in('property_id', scopeIds)
          .eq('lifecycle_status', 'archived'),
        supabase
          .from('escalations')
          .select('id', { count: 'exact', head: true })
          .in('property_id', scopeIds)
          .neq('status', 'open'),
        supabase
          .from('guest_identities')
          .select('id', { count: 'exact', head: true })
          .in('property_id', scopeIds),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .in('property_id', scopeIds),
      ]);
    staysTotal = stayCountRes.count ?? 0;
    requestsTotal = reqCountRes.count ?? 0;
    extrasTotal = extrasCountRes.count ?? 0;
    handledTotal = handledCountRes.count ?? 0;
    guestsTotal = guestsCountRes.count ?? 0;
    conversationsTotal = convoCountRes.count ?? 0;

    // ai_usage is service-role only (RLS denies anon/authenticated on purpose),
    // so its count goes through the admin client and simply shows 0 without one.
    if (hasServiceRole()) {
      const admin = createAdminClient();
      const { count } = await admin
        .from('ai_usage')
        .select('id', { count: 'exact', head: true })
        .in('property_id', scopeIds);
      aiUsageTotal = count ?? 0;
    }
  }

  // Hub cards: one per report topic, each linking straight to its page. Nothing
  // renders below the cards — the grids ARE the reports now.
  const topicCards: Array<{
    key: string;
    href: string;
    icon: typeof Archive;
    label: string;
    count: number;
    sub: string;
  }> = [
    { key: 'past-stays', href: '/dashboard/reports/stays', icon: Archive, label: 'Past stays', count: staysTotal, sub: 'Open the grid →' },
    { key: 'handled-escalations', href: '/dashboard/reports/escalations', icon: MessageSquare, label: 'Handled escalations', count: handledTotal, sub: 'Open the grid →' },
    { key: 'service-reports', href: '/dashboard/reports/service-requests', icon: FileText, label: 'Service reports', count: requestsTotal, sub: 'Open the grid →' },
    { key: 'completed-extras', href: '/dashboard/reports/extras', icon: Sparkles, label: 'Completed extras', count: extrasTotal, sub: 'Open the grid →' },
    { key: 'guest-directory', href: '/dashboard/reports/guests', icon: Users, label: 'Guest directory', count: guestsTotal, sub: 'Open the grid →' },
    { key: 'concierge-activity', href: '/dashboard/reports/conversations', icon: MessagesSquare, label: 'Concierge activity', count: conversationsTotal, sub: 'Open the grid →' },
    { key: 'ai-usage', href: '/dashboard/reports/ai-usage', icon: Cpu, label: 'AI usage', count: aiUsageTotal, sub: 'Open the grid →' },
    { key: 'archived-properties', href: '/dashboard/reports/archived-properties', icon: Building2, label: 'Archived properties', count: archivedCount, sub: 'Open the list →' },
  ];

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Reports</h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Your archive of completed work, guest activity, and retired properties. Each topic opens as its own
          spreadsheet-style report — sort any column, drag columns into a new order, filter, print, or export to
          CSV. A refresh always restores the default view.
        </p>
      </div>

      <PropertyFilter properties={propList.map((p) => ({ id: p.id, name: p.display_name }))} activeId={activeProperty} basePath="/dashboard/reports" />

      <section aria-label="Report views" style={{ margin: '1.25rem 0 2rem' }}>
        <div className="dash-props-grid">
          {topicCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className="card card-interactive"
                style={{ padding: '1rem 1.15rem', display: 'block' }}
                data-testid={`report-card-${card.key}`}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.85rem', fontWeight: 600 }}>
                  <Icon size={15} aria-hidden style={{ color: 'var(--teal)', flexShrink: 0 }} /> {card.label}
                </span>
                <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.1, margin: '.5rem 0 .3rem' }}>
                  {card.count}
                </span>
                <span className="faint" style={{ fontSize: '.76rem' }}>{card.sub}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
