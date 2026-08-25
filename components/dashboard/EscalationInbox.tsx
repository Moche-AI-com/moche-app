'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, Building2, CheckCircle2, MessageSquareReply, Sparkles } from 'lucide-react';
import { closeEscalationAction, closeHandledEscalationsAction, openEscalationThreadAction, setEscalationStatusAction } from '@/app/dashboard/escalations/actions';
import { canAnswerEscalation } from '@/lib/dashboard/escalations-permissions';
import { PropertyFilter } from '@/components/dashboard/PropertyFilter';

export interface EscalationRowData {
  id: string;
  propertyId: string;
  propertyName: string;
  question: string;
  status: string;
  hostResponse: string | null;
  createdAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
}

const STATUS_BADGE: Record<string, string> = { open: 'badge-coral', answered: '', resolved: 'badge-teal', dismissed: '' };
const STATUS_LABEL: Record<string, string> = { open: 'Needs answer', answered: 'Awaiting guest response', resolved: 'Handled', dismissed: 'Cancelled' };

const STATUS_TABS: Array<{ key: string | null; label: string }> = [
  { key: null, label: 'All active' },
  { key: 'open', label: 'Needs answer' },
  { key: 'answered', label: 'Awaiting guest' },
  { key: 'resolved', label: 'Handled' },
  { key: 'dismissed', label: 'Cancelled' },
];

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

function filterHref(property: string | null, status: string | null): string {
  const params = new URLSearchParams();
  if (property) params.set('property', property);
  if (status) params.set('status', status);
  const qs = params.toString();
  return qs ? `/dashboard/escalations?${qs}` : '/dashboard/escalations';
}

function EscalationRow({ row, capabilities }: { row: EscalationRowData; capabilities: { canReceiveEscalations: boolean; canReplyGuests: boolean; canEditBrain: boolean } }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOpen = row.status === 'open';
  const isTerminal = row.status === 'resolved' || row.status === 'dismissed';
  const canReply = canAnswerEscalation(capabilities);
  const canManage = capabilities.canReceiveEscalations;

  // "Answer & teach" moved into the guest's Host Chat thread: the button resolves
  // (or creates) the thread server-side and routes there, so the host replies in
  // the same place every time.
  async function openThread() {
    setOpening(true);
    setError(null);
    try {
      const result = await openEscalationThreadAction(row.id);
      if (result.error || !result.url) throw new Error(result.error ?? 'Could not open the thread.');
      router.push(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open the thread.');
      setOpening(false);
    }
  }

  async function setStatus(status: 'resolved' | 'answered' | 'dismissed') {
    setWorking(true);
    setError(null);
    const formData = new FormData();
    formData.set('escalationId', row.id);
    formData.set('status', status);
    const result = await setEscalationStatusAction({}, formData);
    setWorking(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function close() {
    setWorking(true);
    setError(null);
    const formData = new FormData();
    formData.set('escalationId', row.id);
    const result = await closeEscalationAction({}, formData);
    setWorking(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

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

      {row.hostResponse ? <blockquote className="esc-item-response">{row.hostResponse}</blockquote> : null}

      <div className="esc-item-actions">
        {canReply && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void openThread()} disabled={opening || working}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
              <MessageSquareReply size={14} aria-hidden /> {opening ? 'Opening…' : isOpen ? 'Reply in thread' : 'Open thread'}
            </span>
          </button>
        )}
        {canManage && (
          <select
            className="select"
            value={row.status}
            disabled={working}
            aria-label={`Set status for: ${row.question.slice(0, 60)}`}
            data-testid={`escalation-status-${row.id}`}
            onChange={(event) => {
              const next = event.target.value as 'resolved' | 'answered' | 'dismissed';
              if (next !== row.status) void setStatus(next);
            }}
            style={{ fontSize: '.82rem', minHeight: 36, width: 'auto', padding: '0 .5rem' }}
          >
            <option value="open" disabled>
              Needs answer
            </option>
            <option value="resolved">Handled</option>
            <option value="answered">Awaiting guest response</option>
            <option value="dismissed">Cancelled</option>
          </select>
        )}
        {canManage && isTerminal && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void close()} disabled={working} data-testid={`escalation-close-${row.id}`}>
            <Archive size={13} aria-hidden /> Close
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error" style={{ marginTop: '.5rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function CloseHandledButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={working}
      data-testid={`close-handled-${propertyId}`}
      onClick={async () => {
        setWorking(true);
        const formData = new FormData();
        formData.set('propertyId', propertyId);
        await closeHandledEscalationsAction({}, formData);
        router.refresh();
      }}
    >
      <Archive size={13} aria-hidden /> {working ? 'Closing…' : 'Close all handled'}
    </button>
  );
}

export function EscalationInbox({
  rows,
  properties,
  openCountByProperty,
  activeFilter,
  activeStatus,
  propertyPermissions,
}: {
  rows: EscalationRowData[];
  properties: { id: string; name: string }[];
  openCountByProperty: Record<string, number>;
  activeFilter: string | null;
  activeStatus: string | null;
  propertyPermissions: Record<string, { canReceiveEscalations: boolean; canReplyGuests: boolean; canEditBrain: boolean }>;
}) {
  // Open items first within each group — the ones needing action should never be
  // buried below already-answered history. Within the open set the sort is
  // oldest-first: an escalation queue is worked front-to-back, and the oldest
  // unanswered question is the one most likely to be costing a review.
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        if (a.status === 'open' && b.status === 'open') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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
      {/* Property scoping matches the home overview page: one accessible dropdown
          instead of a pill row. The component preserves the other search params
          (like the status filter) when the scope changes, and hides itself for
          single-property accounts. */}
      <div style={{ marginBottom: '.75rem' }}>
        <PropertyFilter properties={properties} activeId={activeFilter} basePath="/dashboard/escalations" />
      </div>

      <div className="esc-filter-row" role="tablist" aria-label="Filter escalations by status">
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.key || (!activeStatus && tab.key === null);
          return (
            <Link key={tab.label} href={filterHref(activeFilter, tab.key)} className={`esc-filter-pill${isActive ? ' is-active' : ''}`}>
              {tab.label}
            </Link>
          );
        })}
      </div>

      {grouped.length === 0 ? (
        <div className="card esc-empty">
          <Sparkles size={22} aria-hidden style={{ color: 'var(--teal)', marginBottom: '.6rem' }} />
          <p className="muted" style={{ margin: 0 }}>
            {activeStatus
              ? 'No escalations with this status.'
              : activeFilter
                ? 'No escalations for this property yet.'
                : 'No escalations yet \u2014 your AI concierge is handling everything.'}
          </p>
        </div>
      ) : (
        grouped.map(([propertyId, group]) => {
          const permissions = propertyPermissions[propertyId];
          const hasTerminal = group.rows.some((r) => r.status === 'resolved' || r.status === 'dismissed');
          return (
            <div className="esc-group" key={propertyId}>
              {properties.length > 1 && !activeFilter && (
                <div className="esc-group-head">
                  <Building2 size={15} aria-hidden style={{ color: 'var(--iris)' }} />
                  <h2 className="esc-group-title">{group.propertyName}</h2>
                  <span className="esc-group-sub">
                    {group.rows.length} question{group.rows.length === 1 ? '' : 's'}
                  </span>
                  {permissions?.canReceiveEscalations && hasTerminal && <CloseHandledButton propertyId={propertyId} />}
                </div>
              )}
              {group.rows.map((row) => (
                <EscalationRow key={row.id} row={row} capabilities={propertyPermissions[row.propertyId] ?? { canReceiveEscalations: false, canReplyGuests: false, canEditBrain: false }} />
              ))}
            </div>
          );
        })
      )}

      {totalOpen === 0 && rows.length > 0 && !activeStatus && (
        <p className="faint" style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '1rem', fontSize: '.82rem' }}>
          <CheckCircle2 size={14} aria-hidden style={{ color: 'var(--teal)' }} /> All caught up{' \u2014 '}no open escalations.
        </p>
      )}
    </div>
  );
}
