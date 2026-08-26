'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ChevronRight, MessageSquareReply } from 'lucide-react';
import {
  extrasHealthFor,
  fulfillmentForHealth,
  isTerminalExtrasStatus,
  nextStatesFor,
  type ExtrasFulfillmentStatus,
  type ExtrasHealthStatus,
} from '@/lib/extras/lifecycle';
import { openExtrasThreadAction } from './actions';

export type ExtrasOrderRow = {
  id: string;
  property_id: string;
  stay_id: string | null;
  escalation_id: string | null;
  item_title: string;
  item_price_text: string | null;
  quantity: number;
  guest_note: string | null;
  host_note: string | null;
  fulfillment_status: ExtrasFulfillmentStatus;
  request_number: string;
  quoted_amount_cents: number | null;
  quote_currency: string;
  scheduled_for: string | null;
  declined_reason: string | null;
  expires_at: string | null;
  created_at: string;
};

function fmt(value: string | null) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const HEALTH_ORDER: ExtrasHealthStatus[] = ['requested', 'in_progress', 'completed', 'cancelled'];

// Host-facing workflow words requested for the queue. The stored lifecycle stays
// unchanged; these labels map the active request states to the host's queue.
const QUEUE_STATUS_LABEL: Record<ExtrasHealthStatus, string> = {
  requested: 'New',
  in_progress: 'In process',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function queueStatusFor(order: ExtrasOrderRow): string {
  const status = isRequestExpired(order) ? 'expired' : order.fulfillment_status;
  if (status === 'needs_details' || status === 'payment_pending') return 'Waiting On Customer';
  return QUEUE_STATUS_LABEL[extrasHealthFor(status)];
}

function requesterFor(order: ExtrasOrderRow): string | null {
  const match = order.guest_note?.match(/^Requested by:\s*(.+)$/m);
  return match?.[1]?.trim() || null;
}

// The granular actions that live on the Details panel rather than the health
// dropdown — they capture data (a date, an estimate, a note) instead of being
// a plain state flip.
const DETAIL_TARGETS: ExtrasFulfillmentStatus[] = ['accepted', 'scheduled', 'needs_details', 'payment_pending', 'declined'];

export function ExtrasOrdersClient({
  orders,
  propertyNames,
  manageableProperties,
}: {
  orders: ExtrasOrderRow[];
  propertyNames: Record<string, string>;
  /** Property ids this user may act on. Rows outside it render read-only. */
  manageableProperties: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const manageable = new Set(manageableProperties);

  async function updateOrder(order: ExtrasOrderRow, body: Record<string, unknown>): Promise<boolean> {
    setBusy(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${order.property_id}/extras-orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof json.error === 'string' ? json.error : 'Could not update the request.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Network error. Please try again.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <Sparkles size={22} aria-hidden style={{ color: 'var(--text-faint)', marginBottom: '.6rem' }} />
        <p className="muted">
          No requests here yet. When a guest taps an item in your Extras list, it lands in this queue so you can confirm,
          fulfil, or decline it.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" style={{ color: 'var(--coral)', fontSize: '.88rem', margin: '0 0 .75rem' }}>
          {error}
        </p>
      )}
      <div className="report-list">
        {orders.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            propertyName={propertyNames[o.property_id] ?? 'Property'}
            manageable={manageable.has(o.property_id)}
            busy={busy === o.id}
            expanded={expandedId === o.id}
            onToggleExpanded={() => setExpandedId(expandedId === o.id ? null : o.id)}
            onUpdate={(body) => updateOrder(o, body)}
          />
        ))}
      </div>
    </>
  );
}

function OrderRow({
  order,
  propertyName,
  manageable,
  busy,
  expanded,
  onToggleExpanded,
  onUpdate,
}: {
  order: ExtrasOrderRow;
  propertyName: string;
  manageable: boolean;
  busy: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const displayedStatus = isRequestExpired(order) ? 'expired' : order.fulfillment_status;
  const health = extrasHealthFor(displayedStatus);
  const queueStatus = queueStatusFor(order);
  const requester = requesterFor(order);
  const terminal = isTerminalExtrasStatus(displayedStatus);
  const allowed = manageable && !terminal ? nextStatesFor(displayedStatus, 'host') : [];
  const hasDetailActions = DETAIL_TARGETS.some((to) => allowed.includes(to));

  // Requests are handled in the guest's Host Chat thread, same surface as
  // escalations: this resolves (or creates) the thread server-side and routes there.
  async function openThread() {
    setOpening(true);
    setOpenError(null);
    try {
      const result = await openExtrasThreadAction(order.id);
      if (result.error || !result.url) throw new Error(result.error ?? 'Could not open the thread.');
      router.push(result.url);
    } catch (caught) {
      setOpenError(caught instanceof Error ? caught.message : 'Could not open the thread.');
      setOpening(false);
    }
  }

  return (
    <div>
      <div className="report-list-row" data-testid="extras-order-row">
        <div style={{ minWidth: 0 }}>
          <p className="report-list-title">
            {order.item_title}
            {order.quantity > 1 && <span className="faint"> &times;{order.quantity}</span>}
            {order.item_price_text && <span className="faint" style={{ fontWeight: 400 }}> &middot; {order.item_price_text}</span>}
          </p>
          <p className="report-list-meta">
            {requester ? <><strong>Requested by {requester}</strong> &middot;{' '}</> : null}
            {propertyName} &middot;{' '}
            <span className={`badge ${queueStatus === 'New' ? 'badge-coral' : queueStatus === 'Completed' ? 'badge-teal' : ''}`} data-testid="extras-order-status">{queueStatus}</span> &middot;{' '}
            {fmt(order.created_at)}
          </p>
          <p className="faint" style={{ fontSize: '.75rem', marginTop: '.2rem' }}>
            Request {order.request_number}
            {order.scheduled_for ? ` · Scheduled ${fmt(order.scheduled_for)}` : ''}
            {order.quoted_amount_cents !== null ? ` · Estimate ${(order.quoted_amount_cents / 100).toFixed(2)} ${order.quote_currency.toUpperCase()}` : ''}
          </p>
          {order.guest_note && (
            <p className="report-list-meta" style={{ fontStyle: 'italic' }}>
              &ldquo;{order.guest_note}&rdquo;
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {manageable && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void openThread()} disabled={opening || busy} data-testid={`extras-order-thread-${order.id}`}>
              <MessageSquareReply size={13} aria-hidden /> {opening ? 'Opening…' : 'Open thread'}
            </button>
          )}
          {manageable && (
            <select
              className="select"
              value={health}
              disabled={busy || terminal}
              aria-label={`Set status for ${order.item_title}`}
              data-testid={`extras-order-health-${order.id}`}
              onChange={(event) => {
                const next = event.target.value as ExtrasHealthStatus;
                const to = fulfillmentForHealth(next);
                if (to && next !== health) void onUpdate({ status: to });
              }}
              style={{ fontSize: '.82rem', minHeight: 36, width: 'auto', padding: '0 .5rem' }}
            >
              {HEALTH_ORDER.map((h) => (
                <option key={h} value={h} disabled={h === 'requested' && health !== 'requested'}>
                  {QUEUE_STATUS_LABEL[h]}
                </option>
              ))}
            </select>
          )}
          {manageable && !terminal && hasDetailActions && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              data-testid={`extras-order-details-${order.id}`}
            >
              Details <ChevronRight size={13} aria-hidden style={{ transform: expanded ? 'rotate(90deg)' : 'none' }} />
            </button>
          )}
        </div>
      </div>
      {openError && (
        <p role="alert" className="error" style={{ margin: '.3rem 0 0' }}>
          {openError}
        </p>
      )}
      {expanded && <DetailsPanel allowed={allowed} busy={busy} onUpdate={onUpdate} />}
    </div>
  );
}

// The data-capturing transitions, as inline fields instead of window prompts:
// accept with an estimate, schedule, ask the guest for details, mark waiting on
// (off-platform) payment, or decline with a reason.
function DetailsPanel({
  allowed,
  busy,
  onUpdate,
}: {
  allowed: ExtrasFulfillmentStatus[];
  busy: boolean;
  onUpdate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [estimate, setEstimate] = useState('');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const can = (to: ExtrasFulfillmentStatus) => allowed.includes(to);
  const estimateInvalid = estimate.trim() !== '' && (!Number.isFinite(Number(estimate)) || Number(estimate) < 0);

  return (
    <div className="card" style={{ padding: '.85rem 1rem', marginTop: '.35rem' }}>
      <div style={{ display: 'grid', gap: '.85rem' }}>
        {can('accepted') && (
          <div>
            <span className="label" style={{ marginBottom: '.3rem' }}>Accept with an estimate (optional)</span>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="Estimate in USD"
                style={{ maxWidth: 180 }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || estimateInvalid}
                onClick={() =>
                  void onUpdate({
                    status: 'accepted',
                    quotedAmountCents: estimate.trim() ? Math.round(Number(estimate) * 100) : undefined,
                  })
                }
              >
                Accept request
              </button>
            </div>
            <p className="faint" style={{ fontSize: '.75rem', marginTop: '.3rem' }}>
              An estimate is not a charge. Moche never collects guest payments — arrange payment directly with the guest.
            </p>
          </div>
        )}
        {can('scheduled') && (
          <div>
            <span className="label" style={{ marginBottom: '.3rem' }}>Schedule it</span>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || !when}
                onClick={() => void onUpdate({ status: 'scheduled', scheduledFor: new Date(when).toISOString() })}
              >
                Schedule
              </button>
            </div>
          </div>
        )}
        {can('needs_details') && (
          <div>
            <span className="label" style={{ marginBottom: '.3rem' }}>Ask the guest for details</span>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What do you need to know?"
                style={{ flex: 1, minWidth: 220 }}
                maxLength={1000}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || !note.trim()}
                onClick={() => void onUpdate({ status: 'needs_details', hostNote: note.trim() })}
              >
                Ask
              </button>
            </div>
          </div>
        )}
        {can('payment_pending') && (
          <div>
            <span className="label" style={{ marginBottom: '.3rem' }}>Waiting on payment</span>
            <p className="faint" style={{ fontSize: '.75rem', margin: '0 0 .35rem' }}>
              The estimate is out and you are waiting for the guest to pay you directly. Moche never collects it.
            </p>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void onUpdate({ status: 'payment_pending' })}>
              Mark as waiting on payment
            </button>
          </div>
        )}
        {can('declined') && (
          <div>
            <span className="label" style={{ marginBottom: '.3rem' }}>Decline with a reason</span>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why can't this be accommodated?"
                style={{ flex: 1, minWidth: 220 }}
                maxLength={1000}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--coral)' }}
                disabled={busy || !reason.trim()}
                onClick={() => void onUpdate({ status: 'declined', hostNote: reason.trim() })}
              >
                Decline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function isRequestExpired(order: ExtrasOrderRow): boolean {
  return !isTerminalExtrasStatus(order.fulfillment_status)
    && order.expires_at !== null
    && new Date(order.expires_at).getTime() <= Date.now();
}
