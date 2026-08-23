'use client';

import Link from 'next/link';
import { ShieldCheck, ArrowUpRight, Sparkles } from 'lucide-react';
import { CollapseToggle, CollapsibleBody } from '@/components/dashboard/CollapsibleCard';
import { AI_UPDATES_LABEL, primaryAiUpdatesHref, propertyAiUpdatesHref } from '@/lib/brain/ai-updates';
import { useCollapsedCards } from '@/lib/dashboard/use-dashboard-ui-state';

// Dashboard tile for AI Updates (backlog P2-08).
//
// Never "reviews": in short-term-rental language a "review" is what a guest
// writes about the host after checkout, and hosts opened a tab called Reviews
// expecting guest ratings. See lib/brain/ai-updates.ts for the naming decision.
//
// Deliberately a thin summary: count, oldest-pending age, and per-property
// breakdown. The decision itself lives in each property's AI Updates tab,
// because approving AI-drafted text requires actually reading it, and a card on
// a busy overview page invites approving without reading — which is the exact
// failure mode the queue exists to prevent. Every link here therefore lands on
// the property that owns the suggestion, not on an account-level list.
export interface UpdateQueueCardRow {
  propertyId: string;
  propertyName: string;
  pending: number;
}

export function UpdateQueueCard({
  rows,
  detail,
  pending,
  affectedProperties,
  oldestLabel,
  scopedPropertyId,
}: {
  rows: UpdateQueueCardRow[];
  /** Pre-computed subtitle from queueSummary() so the copy has one definition. */
  detail: string;
  pending: number;
  affectedProperties: number;
  oldestLabel: string | null;
  /** Active dashboard property scope, when the host has narrowed to one property. */
  scopedPropertyId?: string | null;
}) {
  const { isCollapsed, toggle } = useCollapsedCards();
  const collapsed = isCollapsed('update-queue');
  const hasPending = pending > 0;
  const primaryHref = primaryAiUpdatesHref(rows, scopedPropertyId);

  return (
    <section className="card dash-panel rise-in" data-testid="update-queue-card">
      <div className="dash-panel-head">
        <div>
          <h2 className="dash-section-title">
            <ShieldCheck size={16} aria-hidden /> {AI_UPDATES_LABEL}
          </h2>
          <p className="dash-section-sub">Draft knowledge waiting for your approval.</p>
        </div>
        <div className="dash-panel-head-aside">
          {hasPending && (
            <span className="badge badge-coral" data-testid="update-queue-total">
              {pending} waiting
            </span>
          )}
          <CollapseToggle
            collapsed={collapsed}
            onToggle={() => toggle('update-queue')}
            panelId="update-queue-body"
            label={AI_UPDATES_LABEL}
          />
        </div>
      </div>

      <CollapsibleBody id="update-queue-body" collapsed={collapsed}>
        {hasPending ? (
          <>
            <p className="muted" style={{ margin: '0 0 .6rem', fontSize: '.85rem' }} data-testid="update-queue-detail">
              {detail}
            </p>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '.45rem',
                margin: '0 0 .85rem',
              }}
              data-testid="update-queue-facts"
            >
              <div>
                <dt className="faint" style={{ fontSize: '.72rem' }}>Pending</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>{pending}</dd>
              </div>
              <div>
                <dt className="faint" style={{ fontSize: '.72rem' }}>Affected properties</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>{affectedProperties}</dd>
              </div>
              <div>
                <dt className="faint" style={{ fontSize: '.72rem' }}>Oldest item</dt>
                <dd style={{ margin: '.1rem 0 0', fontWeight: 700 }}>{oldestLabel ?? 'None'}</dd>
              </div>
            </dl>
            {affectedProperties > 1 && (
              <ul className="dash-topics" data-testid="update-queue-list">
                {rows
                  .filter((r) => r.pending > 0)
                  .map((r) => (
                    <li key={r.propertyId} className="dash-topic" data-testid="update-queue-row">
                      <Link
                        href={propertyAiUpdatesHref(r.propertyId)}
                        className="dash-topic-row"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <span className="dash-topic-label" style={{ minWidth: 0 }}>
                          {r.propertyName}
                        </span>
                        <span className="dash-topic-count">
                          {r.pending} draft{r.pending === 1 ? '' : 's'}
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
            <Link href={primaryHref} className="dash-panel-link">
              Review {AI_UPDATES_LABEL} <ArrowUpRight size={14} aria-hidden />
            </Link>
          </>
        ) : (
          <div className="dash-panel-empty" data-testid="update-queue-empty">
            <span className="dash-panel-empty-icon" aria-hidden>
              <Sparkles size={20} aria-hidden />
            </span>
            <p className="dash-panel-empty-title">Nothing waiting</p>
            <p className="dash-panel-empty-sub">{detail}</p>
          </div>
        )}
      </CollapsibleBody>
    </section>
  );
}
