'use client';

import Link from 'next/link';
import { Gift, ArrowUpRight, Sparkles } from 'lucide-react';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';

// A guest tapping "Request" on an Extra doesn't create its own row anywhere —
// it reuses the existing escalation pipeline (see app/api/guest/[slug]/extras-request/route.ts),
// landing in `escalations` with a `question` prefixed "Enhancement request:". This card
// summarizes that same data, grouped by property, so hosts can see Extras demand at a
// glance without a new table. Never say "upsell" here — guest- and host-facing copy is
// "Extras" only.
export interface ExtrasRequestRow {
  propertyId: string;
  propertyName: string;
  count: number;
  openCount: number;
  resolvedCount: number;
}

export function ExtrasRequestsCard({ rows }: { rows: ExtrasRequestRow[] }) {
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('extras-requests');
  const totalRequests = rows.reduce((a, r) => a + r.count, 0);
  const totalOpen = rows.reduce((a, r) => a + r.openCount, 0);
  const totalResolved = rows.reduce((a, r) => a + r.resolvedCount, 0);
  const hasRequests = totalRequests > 0;

  return (
    <section className="card dash-panel rise-in" data-testid="extras-requests-card">
      <div className="dash-panel-head">
        <div>
          <h2 className="dash-section-title">
            <Gift size={16} aria-hidden /> Extras requests
          </h2>
          <p className="dash-section-sub">Guests asking for Extras on their stay, by property.</p>
        </div>
        <div className="dash-panel-head-aside">
          {hasRequests && (
            <span className={`badge ${totalOpen > 0 ? 'badge-coral' : 'badge-teal'}`} data-testid="extras-requests-total">
              {totalRequests} total{totalOpen > 0 ? ` · ${totalOpen} open` : ''}
            </span>
          )}
          <CollapseToggle collapsed={collapsed} onToggle={() => toggle('extras-requests')} panelId="extras-requests-body" label="Extras requests" />
        </div>
      </div>

      <CollapsibleBody id="extras-requests-body" collapsed={collapsed}>
        {hasRequests ? (
          <>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '.45rem',
                margin: '0 0 .65rem',
              }}
              data-testid="extras-requests-breakdown"
            >
              <div>
                <dt className="faint" style={{ fontSize: '.72rem' }}>Needs response</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>{totalOpen}</dd>
              </div>
              <div title="Payment status is not recorded on escalation-backed Extras requests.">
                <dt className="faint" style={{ fontSize: '.72rem' }}>Payment pending</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>0</dd>
              </div>
              <div title="Scheduling data is not recorded on escalation-backed Extras requests.">
                <dt className="faint" style={{ fontSize: '.72rem' }}>Scheduled today</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>0</dd>
              </div>
            </dl>
            <p className="faint" style={{ margin: '0 0 .85rem', fontSize: '.75rem' }}>
              Payment and scheduling are not recorded for Extras requests yet, so those counts are shown as zero.
              {totalResolved > 0 ? ` ${totalResolved} closed or resolved request${totalResolved === 1 ? '' : 's'}.` : ''}
            </p>
            <ul className="dash-topics" data-testid="extras-requests-list">
              {rows
                .filter((r) => r.count > 0)
                .map((r) => (
                  <li key={r.propertyId} className="dash-topic" data-testid="extras-requests-row">
                    <Link
                      href={`/dashboard/escalations?property=${r.propertyId}`}
                      className="dash-topic-row"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <span className="dash-topic-label" style={{ minWidth: 0 }}>
                        {r.propertyName}
                      </span>
                      <span className="dash-topic-count">
                        {r.count} request{r.count === 1 ? '' : 's'}
                        {r.openCount > 0 && <span className="faint"> · {r.openCount} need response</span>}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <div className="dash-panel-empty" data-testid="extras-requests-empty">
            <span className="dash-panel-empty-icon" aria-hidden>
              <Sparkles size={20} aria-hidden />
            </span>
            <p className="dash-panel-empty-title">No Extras requests yet</p>
            <p className="dash-panel-empty-sub">
              When a guest taps &ldquo;Request&rdquo; on an Extra, it lands here and in your escalations, grouped by property.
            </p>
          </div>
        )}
        {hasRequests && (
          <Link href="/dashboard/escalations" className="dash-panel-link">
            View Extras requests in Escalations <ArrowUpRight size={14} aria-hidden />
          </Link>
        )}
      </CollapsibleBody>
    </section>
  );
}
