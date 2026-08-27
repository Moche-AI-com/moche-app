import Link from 'next/link';
import { Printer, Archive, FileText, Sparkles, Building2, MessageSquare, Users } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';
import { EXTRAS_ORDER_STATUS_LABEL, type ExtrasOrderStatus } from '@/lib/dashboard/extras-orders';
import { RestorePropertyButton } from './RestorePropertyButton';
import { HandledEscalations, type HandledEscalation, type HandledThreadMessage } from './HandledEscalations';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  resolved: 'Resolved',
  closed: 'Closed',
  completed: 'Completed',
  revoked: 'Revoked',
};

function fmtDate(value: string | null) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ property?: string | string[] }>;
}) {
  const ctx = await requireSession();
  const supabase = createClient();
  const sp = (await searchParams) ?? {};

  // Deliberately NOT filtered on `deleted_at`. Permanently deleting a property
  // keeps the host's reports and leaves the property row behind as a stripped
  // tombstone (see lib/properties/purge.ts) precisely so those reports can still
  // say which property they came from. Filtering deleted rows out here would
  // label every retained report "Property".
  const { data: properties } = await supabase
    .from('properties')
    .select('id, display_name, status, archived_at, updated_at, deleted_at')
    .eq('host_account_id', ctx.account.id)
    .order('display_name');

  const allProps = properties ?? [];
  // Names cover deleted properties too, so a retained report keeps its label.
  const propNames = new Map(allProps.map((p) => [p.id, p.display_name]));
  // The filter and the report scope only offer properties that still exist.
  const propList = allProps.filter((p) => p.deleted_at === null);

  // Archived properties live here rather than in the Properties list. Ordered
  // newest-archived-first, falling back to `updated_at` for rows archived before
  // `archived_at` existed.
  const archivedProps = propList
    .filter((p) => p.status === 'archived')
    .sort((a, b) => (b.archived_at ?? b.updated_at).localeCompare(a.archived_at ?? a.updated_at));

  // Only honour a property filter for a property this account actually owns.
  // Otherwise a hand-edited ?property= would produce a confusing empty page
  // instead of simply being ignored.
  const requested = Array.isArray(sp.property) ? sp.property[0] : sp.property;
  const activeProperty = requested && propNames.has(requested) ? requested : null;
  const scopeIds = activeProperty ? [activeProperty] : propList.map((p) => p.id);

  let requests: Array<{ id: string; property_id: string; service_type: string; status: string; urgency: string; created_at: string; archived_at: string | null; summary: string | null; description: string }> = [];
  let stays: Array<{ id: string; property_id: string; guest_display_name: string | null; check_in: string | null; check_out: string | null; status: string; archived_at: string | null }> = [];
  let extras: Array<{ id: string; property_id: string; item_title: string; item_price_text: string | null; quantity: number; status: ExtrasOrderStatus; created_at: string; archived_at: string | null }> = [];
  let handled: HandledEscalation[] = [];

  // Exact per-topic totals for the hub cards. Head-only count queries are cheap
  // and stay accurate past the 200-row list caps below.
  let staysTotal = 0;
  let requestsTotal = 0;
  let extrasTotal = 0;
  let handledTotal = 0;
  let guestsTotal = 0;

  if (scopeIds.length) {
    const [reqRes, stayRes, extrasRes, stayCountRes, reqCountRes, extrasCountRes, handledCountRes, guestsCountRes] =
      await Promise.all([
        supabase
          .from('service_requests')
          .select('id, property_id, service_type, status, urgency, created_at, archived_at, summary, description')
          .in('property_id', scopeIds)
          .eq('lifecycle_status', 'archived')
          .order('archived_at', { ascending: false, nullsFirst: false })
          .limit(200),
        supabase
          .from('stays')
          .select('id, property_id, guest_display_name, check_in, check_out, status, archived_at')
          .in('property_id', scopeIds)
          .is('deleted_at', null)
          .eq('lifecycle_status', 'archived')
          .order('check_out', { ascending: false, nullsFirst: false })
          .limit(200),
        supabase
          .from('extras_orders')
          .select('id, property_id, item_title, item_price_text, quantity, status, created_at, archived_at')
          .in('property_id', scopeIds)
          .eq('lifecycle_status', 'archived')
          .order('archived_at', { ascending: false, nullsFirst: false })
          .limit(200),
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
      ]);
    requests = reqRes.data ?? [];
    stays = stayRes.data ?? [];
    extras = (extrasRes.data ?? []) as typeof extras;
    staysTotal = stayCountRes.count ?? 0;
    requestsTotal = reqCountRes.count ?? 0;
    extrasTotal = extrasCountRes.count ?? 0;
    handledTotal = handledCountRes.count ?? 0;
    guestsTotal = guestsCountRes.count ?? 0;

    // Handled escalations — every guest question a real person ended up answering.
    // Fetched in two hops rather than one join because the thread is the expensive
    // part and only the escalations that actually have a conversation need it.
    const { data: escRows } = await supabase
      .from('escalations')
      .select('id, property_id, question, status, host_response, responded_at, created_at, conversation_id')
      .in('property_id', scopeIds)
      .neq('status', 'open')
      .order('responded_at', { ascending: false, nullsFirst: false })
      .limit(100);

    const escalations = escRows ?? [];
    const convIds = escalations.map((e) => e.conversation_id).filter((id): id is string => Boolean(id));

    // One query for every thread, grouped in memory. 100 escalations x ~10 messages
    // is well inside a single round trip, and it avoids a request per row.
    const threads = new Map<string, HandledThreadMessage[]>();
    if (convIds.length) {
      const { data: msgRows } = await supabase
        .from('messages')
        .select('id, conversation_id, role, content, created_at, ai_training_excluded')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true })
        .limit(1500);
      for (const m of msgRows ?? []) {
        const list = threads.get(m.conversation_id) ?? [];
        list.push({
          id: m.id,
          role: m.role as HandledThreadMessage['role'],
          content: m.content,
          created_at: m.created_at,
          ai_training_excluded: m.ai_training_excluded,
        });
        threads.set(m.conversation_id, list);
      }
    }

    handled = escalations.map((e) => ({
      id: e.id,
      propertyName: propNames.get(e.property_id) ?? 'Property',
      question: e.question,
      hostResponse: e.host_response,
      status: e.status,
      respondedAt: e.responded_at,
      createdAt: e.created_at,
      messages: e.conversation_id ? threads.get(e.conversation_id) ?? [] : [],
    }));
  }

  const empty =
    requests.length === 0 && stays.length === 0 && extras.length === 0 && archivedProps.length === 0 &&
    handled.length === 0;

  // Hub cards: one per report topic, each linking straight to its grid. The
  // expandable thread view (with the AI-training switches) stays on this page —
  // it is a detail surface, not a spreadsheet.
  const topicCards: Array<{
    key: string;
    href: string;
    icon: typeof Archive;
    label: string;
    count: number;
    sub: string;
  }> = [
    {
      key: 'past-stays',
      href: '/dashboard/reports/stays',
      icon: Archive,
      label: 'Past stays',
      count: staysTotal,
      sub: 'Open the grid \u2192',
    },
    {
      key: 'handled-escalations',
      href: '/dashboard/reports/escalations',
      icon: MessageSquare,
      label: 'Handled escalations',
      count: handledTotal,
      sub: 'Open the grid \u2192',
    },
    {
      key: 'service-reports',
      href: '/dashboard/reports/service-requests',
      icon: FileText,
      label: 'Service reports',
      count: requestsTotal,
      sub: 'Open the grid \u2192',
    },
    {
      key: 'completed-extras',
      href: '/dashboard/reports/extras',
      icon: Sparkles,
      label: 'Completed extras',
      count: extrasTotal,
      sub: 'Open the grid \u2192',
    },
    {
      key: 'archived-properties',
      href: '#archived-properties',
      icon: Building2,
      label: 'Archived properties',
      count: archivedProps.length,
      sub: 'Summary below',
    },
    {
      key: 'guest-directory',
      href: '/dashboard/reports/guests',
      icon: Users,
      label: 'Guest directory',
      count: guestsTotal,
      sub: 'Open the grid \u2192',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Reports</h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: '.35rem 0 0' }}>
          Your archive of completed work and retired properties. Print any service report for a contractor, an owner,
          or your own records.
        </p>
      </div>

      <PropertyFilter properties={propList.map((p) => ({ id: p.id, name: p.display_name }))} activeId={activeProperty} basePath="/dashboard/reports" />

      <section aria-label="Report views" style={{ margin: '1.25rem 0 2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '.4rem' }}>Report views</h2>
        <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 .85rem' }}>
          Each topic opens as its own spreadsheet-style report — sort any column, drag columns into a new order,
          filter, print, or export to CSV. A refresh always restores the default view.
        </p>
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

      {empty ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <Archive size={22} aria-hidden style={{ color: 'var(--text-faint)', marginBottom: '.6rem' }} />
          <p className="muted">
            Nothing archived yet. Once you resolve a service request, complete an extra, a stay checks out, or you
            archive a property, it appears here as a printable record.
          </p>
        </div>
      ) : (
        <>
          {archivedProps.length > 0 && (
            <section id="archived-properties" style={{ marginBottom: '2rem', scrollMarginTop: '1rem' }} data-testid="archived-properties-section">
              <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
                <Building2 size={16} aria-hidden /> Archived properties
                <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({archivedProps.length})</span>
              </h2>
              <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 .75rem' }}>
                These are out of your active list and their guest portals are closed. Their records stay here, and you can
                restore one at any time — it comes back paused so you decide when guests get in again.
              </p>
              <div className="report-list">
                {archivedProps.map((p) => (
                  <div key={p.id} className="report-list-row" data-testid="archived-property-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">{p.display_name}</p>
                      <p className="report-list-meta">Archived {fmtDate(p.archived_at ?? p.updated_at)}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                      <RestorePropertyButton propertyId={p.id} />
                      <Link href={`/dashboard/properties/${p.id}`} className="btn btn-ghost btn-sm">
                        Open
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="handled-escalations" style={{ marginBottom: '2rem', scrollMarginTop: '1rem' }} data-testid="handled-escalations-section">
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <MessageSquare size={16} aria-hidden /> Handled escalations
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({handled.length})</span>
              <Link
                href="/dashboard/reports/escalations"
                className="dash-section-link"
                style={{ marginLeft: 'auto', fontSize: '.8rem' }}
                data-testid="handled-escalations-grid-link"
              >
                Open grid view \u2192
              </Link>
            </h2>
            <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 .75rem' }}>
              Every guest question your team answered personally, with the full thread around it. Open one to see what the
              guest asked, what the concierge had already tried, and what you replied — and to choose whether each of your
              replies is used to train the concierge for future guests.
            </p>
            <HandledEscalations items={handled} />
          </section>

          <section id="service-reports" style={{ marginBottom: '2rem', scrollMarginTop: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <FileText size={16} aria-hidden /> Service reports
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({requests.length})</span>
              <Link
                href="/dashboard/reports/service-requests"
                className="dash-section-link"
                style={{ marginLeft: 'auto', fontSize: '.8rem' }}
                data-testid="service-reports-grid-link"
              >
                Open grid view \u2192
              </Link>
            </h2>
            {requests.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>No resolved service requests yet.</p>
            ) : (
              <div className="report-list">
                {requests.map((r) => (
                  <div key={r.id} className="report-list-row" data-testid="report-request-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">{r.summary || r.description}</p>
                      <p className="report-list-meta">
                        {propNames.get(r.property_id) ?? 'Property'} &middot; {r.service_type.replace(/_/g, ' ')} &middot;{' '}
                        {STATUS_LABEL[r.status] ?? r.status} {fmtDate(r.archived_at ?? r.created_at)}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/reports/service-request/${r.id}`}
                      className="btn btn-ghost btn-sm"
                      data-testid="report-print-link"
                    >
                      <Printer size={13} aria-hidden /> Report
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="completed-extras" style={{ marginBottom: '2rem', scrollMarginTop: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <Sparkles size={16} aria-hidden /> Completed extras
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({extras.length})</span>
              <Link
                href="/dashboard/reports/extras"
                className="dash-section-link"
                style={{ marginLeft: 'auto', fontSize: '.8rem' }}
                data-testid="completed-extras-grid-link"
              >
                Open grid view \u2192
              </Link>
            </h2>
            {extras.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>No completed extras yet.</p>
            ) : (
              <div className="report-list">
                {extras.map((e) => (
                  <div key={e.id} className="report-list-row" data-testid="report-extra-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">
                        {e.item_title}
                        {e.quantity > 1 && <span className="faint"> &times;{e.quantity}</span>}
                      </p>
                      <p className="report-list-meta">
                        {propNames.get(e.property_id) ?? 'Property'}
                        {e.item_price_text ? ` \u00b7 ${e.item_price_text}` : ''} &middot;{' '}
                        {EXTRAS_ORDER_STATUS_LABEL[e.status] ?? e.status} {fmtDate(e.archived_at ?? e.created_at)}
                      </p>
                    </div>
                    <Link href="/dashboard/extras?view=past" className="btn btn-ghost btn-sm">
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="past-stays" style={{ scrollMarginTop: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.75rem' }}>
              <Archive size={16} aria-hidden /> Past stays
              <span className="faint" style={{ fontSize: '.8rem', fontWeight: 400 }}>({stays.length})</span>
              <Link
                href="/dashboard/reports/stays"
                className="dash-section-link"
                style={{ marginLeft: 'auto', fontSize: '.8rem' }}
                data-testid="past-stays-grid-link"
              >
                Open grid view \u2192
              </Link>
            </h2>
            {stays.length === 0 ? (
              <p className="muted" style={{ fontSize: '.88rem' }}>No completed stays yet.</p>
            ) : (
              <div className="report-list">
                {stays.map((s) => (
                  <div key={s.id} className="report-list-row" data-testid="report-stay-row">
                    <div style={{ minWidth: 0 }}>
                      <p className="report-list-title">{s.guest_display_name || 'Guest'}</p>
                      <p className="report-list-meta">
                        {propNames.get(s.property_id) ?? 'Property'} &middot; {fmtDate(s.check_in)} to {fmtDate(s.check_out)} &middot;{' '}
                        {STATUS_LABEL[s.status] ?? s.status}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/properties/${s.property_id}/stays?view=past`}
                      className="btn btn-ghost btn-sm"
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
