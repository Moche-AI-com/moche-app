'use client';

import Link from 'next/link';
import { Gift, ArrowUpRight, Sparkles } from 'lucide-react';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';

// The card is fed from durable extras_orders rows rather than a notification
// surrogate, so every count reflects the request lifecycle hosts actually act on.
export interface ExtrasRequestRow {
  propertyId: string;
  propertyName: string;
  count: number;
  openCount: number;
  resolvedCount: number;
  paymentPending: number;
  scheduledToday: number;
}

export function ExtrasRequestsCard({ rows }: { rows: ExtrasRequestRow[] }) {
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('extras-requests');
  const totalRequests = rows.reduce((a, r) => a + r.count, 0);
  const totalOpen = rows.reduce((a, r) => a + r.openCount, 0);
  const totalResolved = rows.reduce((a, r) => a + r.resolvedCount, 0);
  const totalPaymentPending = rows.reduce((a, r) => a + r.paymentPending, 0);
  const totalScheduledToday = rows.reduce((a, r) => a + r.scheduledToday, 0);
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
              <div>
                <dt className="faint" style={{ fontSize: '.72rem' }}>Payment pending</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>{totalPaymentPending}</dd>
              </div>
              <div>
                <dt className="faint" style={{ fontSize: '.72rem' }}>Scheduled today</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>{totalScheduledToday}</dd>
              </div>
            </dl>
            <p className="faint" style={{ margin: '0 0 .85rem', fontSize: '.75rem' }}>
              Payment pending only records an arrangement outside Moche; no guest card is charged.
              {totalResolved > 0 ? ` ${totalResolved} completed, declined, canceled, expired, or refunded request${totalResolved === 1 ? '' : 's'}.` : ''}
            </p>
            <ul className="dash-topics" data-testid="extras-requests-list">
              {rows
                .filter((r) => r.count > 0)
                .map((r) => (
                  <li key={r.propertyId} className="dash-topic" data-testid="extras-requests-row">
                    <Link
                      href="/dashboard/extras"
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
              When a guest sends an Extras request, it appears here with a status timeline.
            </p>
          </div>
        )}
        {hasRequests && (
          <Link href="/dashboard/extras" className="dash-panel-link">
            View Extras queue <ArrowUpRight size={14} aria-hidden />
          </Link>
        )}
      </CollapsibleBody>
    </section>
  );
}
