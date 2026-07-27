'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, MessageSquareReply, Sparkles, ArrowUpRight } from 'lucide-react';
import { EscalationAnswerForm } from './[id]/EscalationAnswerForm';

export interface EscalationRowData {
  id: string;
  propertyId: string;
  propertyName: string;
  question: string;
  status: string;
  hostResponse: string | null;
  createdAt: string;
  respondedAt: string | null;
}

const STATUS_BADGE: Record<string, string> = { open: 'badge-coral', answered: 'badge-teal', resolved: '', dismissed: '' };
const STATUS_LABEL: Record<string, string> = { open: 'Needs answer', answered: 'Answered', resolved: 'Resolved', dismissed: 'Dismissed' };

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EscalationRow({ row }: { row: EscalationRowData }) {
  const [answering, setAnswering] = useState(false);
  const isOpen = row.status === 'open';

  return (
    <div className="card esc-item rise-in" data-testid="escalation-row">
      <div className="esc-item-top">
        <div className="esc-item-badges">
          <span className="badge badge-property">
            <Building2 size={12} aria-hidden />
            <span>{row.propertyName}</span>
          </span>
          <span className={`badge ${STATUS_BADGE[row.status] ?? ''}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
        </div>
        <span className="esc-item-time">{timeAgo(row.createdAt)}</span>
      </div>

      <p className="esc-item-question">{row.question}</p>

      {row.hostResponse ? (
        <blockquote className="esc-item-response">{row.hostResponse}</blockquote>
      ) : isOpen && !answering ? (
        <div className="esc-item-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAnswering(true)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
              <MessageSquareReply size={14} aria-hidden /> Answer & teach the Brain
            </span>
          </button>
          <Link href={`/dashboard/escalations/${row.id}`} className="dash-section-link" style={{ fontSize: '.82rem' }}>
            View full conversation <ArrowUpRight size={13} aria-hidden />
          </Link>
        </div>
      ) : null}

      {isOpen && answering && (
        <div className="esc-quick-form">
          <EscalationAnswerForm escalationId={row.id} />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ marginTop: '.6rem' }}
            onClick={() => setAnswering(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function EscalationsList({
  rows,
  properties,
  openCountByProperty,
  activeFilter,
}: {
  rows: EscalationRowData[];
  properties: { id: string; name: string }[];
  openCountByProperty: Record<string, number>;
  activeFilter: string | null;
}) {
  // Open items first within each group \u2014 the ones needing action should never be
  // buried below already-answered history.
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }),
    [rows],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { propertyName: string; rows: EscalationRowData[] }>();
    for (const r of sorted) {
      const g = map.get(r.propertyId) ?? { propertyName: r.propertyName, rows: [] };
      g.rows.push(r);
      map.set(r.propertyId, g);
    }
    return [...map.entries()].sort((a, b) => a[1].propertyName.localeCompare(b[1].propertyName));
  }, [sorted]);

  const totalOpen = Object.values(openCountByProperty).reduce((a, b) => a + b, 0);

  return (
    <div>
      {properties.length > 1 && (
        <div className="esc-filter-row" role="tablist" aria-label="Filter escalations by property">
          <Link href="/dashboard/escalations" className={`esc-filter-pill${!activeFilter ? ' is-active' : ''}`}>
            All properties
            {totalOpen > 0 && (
              <span className={`esc-filter-count${!activeFilter ? '' : ' has-open'}`}>{totalOpen}</span>
            )}
          </Link>
          {properties.map((p) => {
            const openCount = openCountByProperty[p.id] ?? 0;
            const isActive = activeFilter === p.id;
            return (
              <Link key={p.id} href={`/dashboard/escalations?property=${p.id}`} className={`esc-filter-pill${isActive ? ' is-active' : ''}`}>
                {p.name}
                {openCount > 0 && <span className={`esc-filter-count${isActive ? '' : ' has-open'}`}>{openCount}</span>}
              </Link>
            );
          })}
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="card esc-empty">
          <Sparkles size={22} aria-hidden style={{ color: 'var(--teal)', marginBottom: '.6rem' }} />
          <p className="muted" style={{ margin: 0 }}>
            {activeFilter ? 'No escalations for this property yet.' : 'No escalations yet \u2014 your AI concierge is handling everything.'}
          </p>
        </div>
      ) : (
        grouped.map(([propertyId, group]) => (
          <div className="esc-group" key={propertyId}>
            {properties.length > 1 && !activeFilter && (
              <div className="esc-group-head">
                <Building2 size={15} aria-hidden style={{ color: 'var(--iris)' }} />
                <h2 className="esc-group-title">{group.propertyName}</h2>
                <span className="esc-group-sub">
                  {group.rows.length} question{group.rows.length === 1 ? '' : 's'}
                </span>
              </div>
            )}
            {group.rows.map((row) => (
              <EscalationRow key={row.id} row={row} />
            ))}
          </div>
        ))
      )}

      {totalOpen === 0 && rows.length > 0 && (
        <p className="faint" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '1rem', fontSize: '.82rem' }}>
          <CheckCircle2 size={14} aria-hidden style={{ color: 'var(--teal)' }} /> All caught up{' \u2014 '}no open escalations.
        </p>
      )}
    </div>
  );
}
