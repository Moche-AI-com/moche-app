'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  EXTRAS_STATUS_LABEL,
  isTerminalExtrasStatus,
  nextStatesFor,
  type ExtrasFulfillmentStatus,
} from '@/lib/extras/lifecycle';

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
  const manageable = new Set(manageableProperties);

  async function move(order: ExtrasOrderRow, to: ExtrasFulfillmentStatus) {
    let hostNote: string | undefined;
    let scheduledFor: string | undefined;
    let quotedAmountCents: number | undefined;
    if (to === 'needs_details') {
      hostNote = window.prompt('What details do you need from the guest?')?.trim();
      if (!hostNote) return;
    }
    if (to === 'declined') {
      hostNote = window.prompt('Why can this request not be accommodated?')?.trim();
      if (!hostNote) return;
    }
    if (to === 'scheduled') {
      const rawDate = window.prompt('When is this scheduled? Use a date and time.');
      if (!rawDate) return;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) {
        setError('Enter a valid date and time to schedule this request.');
        return;
      }
      scheduledFor = date.toISOString();
    }
    if (to === 'accepted') {
      const rawEstimate = window.prompt('Optional estimate in USD. This is not a charge and your guest must confirm arrangements.');
      if (rawEstimate?.trim()) {
        const amount = Number(rawEstimate);
        if (!Number.isFinite(amount) || amount < 0) {
          setError('Enter a non-negative estimate or leave it blank.');
          return;
        }
        quotedAmountCents = Math.round(amount * 100);
      }
    }
    setBusy(`${order.id}:${to}`);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${order.property_id}/extras-orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, hostNote, scheduledFor, quotedAmountCents }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Could not update the order.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
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
        {orders.map((o) => {
          const displayedStatus = isRequestExpired(o) ? 'expired' : o.fulfillment_status;
          const actions = manageable.has(o.property_id) ? nextStatesFor(displayedStatus, 'host') : [];
          return (
            <div key={o.id} className="report-list-row" data-testid="extras-order-row">
              <div style={{ minWidth: 0 }}>
                <p className="report-list-title">
                  {o.item_title}
                  {o.quantity > 1 && <span className="faint"> &times;{o.quantity}</span>}
                  {o.item_price_text && <span className="faint" style={{ fontWeight: 400 }}> &middot; {o.item_price_text}</span>}
                </p>
                <p className="report-list-meta">
                  {propertyNames[o.property_id] ?? 'Property'} &middot;{' '}
                  <span data-testid="extras-order-status">{EXTRAS_STATUS_LABEL[displayedStatus]}</span> &middot;{' '}
                  {fmt(o.created_at)}
                </p>
                <p className="faint" style={{ fontSize: '.75rem', marginTop: '.2rem' }}>
                  Request {o.request_number}
                  {o.scheduled_for ? ` · Scheduled ${fmt(o.scheduled_for)}` : ''}
                  {o.quoted_amount_cents !== null ? ` · Estimate ${(o.quoted_amount_cents / 100).toFixed(2)} ${o.quote_currency.toUpperCase()}` : ''}
                </p>
                {o.guest_note && (
                  <p className="report-list-meta" style={{ fontStyle: 'italic' }}>
                    &ldquo;{o.guest_note}&rdquo;
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {o.escalation_id && (
                  <Link
                    href={`/dashboard/escalations/${o.escalation_id}`}
                    className="btn btn-ghost btn-sm"
                    title="Open the guest thread"
                  >
                    <ExternalLink size={13} aria-hidden /> Thread
                  </Link>
                )}
                {actions.map((to) => (
                  <button
                    key={to}
                    type="button"
                    className={`btn btn-sm ${to === 'accepted' || to === 'scheduled' || to === 'fulfilled' ? 'btn-primary' : 'btn-ghost'}`}
                    style={to === 'declined' || to === 'canceled' ? { color: 'var(--coral)' } : undefined}
                    disabled={busy !== null}
                    onClick={() => move(o, to)}
                    data-testid={`extras-order-action-${to}`}
                  >
                    {busy === `${o.id}:${to}` ? 'Saving\u2026' : hostActionLabel(to)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function isRequestExpired(order: ExtrasOrderRow): boolean {
  return !isTerminalExtrasStatus(order.fulfillment_status)
    && order.expires_at !== null
    && new Date(order.expires_at).getTime() <= Date.now();
}

function hostActionLabel(status: ExtrasFulfillmentStatus): string {
  switch (status) {
    case 'needs_details': return 'Ask for details';
    case 'payment_pending': return 'Awaiting off-platform payment';
    case 'scheduled': return 'Schedule';
    case 'fulfilled': return 'Mark fulfilled';
    case 'declined': return 'Decline';
    case 'canceled': return 'Cancel';
    default: return EXTRAS_STATUS_LABEL[status];
  }
}
