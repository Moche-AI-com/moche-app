'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  EXTRAS_ORDER_STATUS_LABEL,
  primaryExtrasOrderActions,
  type ExtrasOrderStatus,
} from '@/lib/dashboard/extras-orders';

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
  status: ExtrasOrderStatus;
  created_at: string;
  archived_at: string | null;
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

  async function move(order: ExtrasOrderRow, to: ExtrasOrderStatus) {
    setBusy(`${order.id}:${to}`);
    setError(null);
    try {
      const res = await fetch(`/api/host/properties/${order.property_id}/extras-orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
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
          const actions = manageable.has(o.property_id) ? primaryExtrasOrderActions(o.status) : [];
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
                  <span data-testid="extras-order-status">{EXTRAS_ORDER_STATUS_LABEL[o.status]}</span> &middot;{' '}
                  {fmt(o.archived_at ?? o.created_at)}
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
                {actions.map((a) => (
                  <button
                    key={a.to}
                    type="button"
                    className={`btn btn-sm ${a.tone === 'primary' ? 'btn-primary' : 'btn-ghost'}`}
                    style={a.tone === 'danger' ? { color: 'var(--coral)' } : undefined}
                    disabled={busy !== null}
                    onClick={() => move(o, a.to)}
                    data-testid={`extras-order-action-${a.to}`}
                  >
                    {busy === `${o.id}:${a.to}` ? 'Saving\u2026' : a.label}
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
