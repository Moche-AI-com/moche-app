'use client';

import { useState } from 'react';
import type { PlanId } from '@/lib/constants';

type Props =
  | { mode: 'checkout'; planId: PlanId; isCurrent: boolean; configured: boolean }
  | { mode: 'portal'; configured: boolean };

export function BillingActions(props: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(endpoint: string, body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  if (props.mode === 'portal') {
    return (
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        disabled={!props.configured || loading}
        onClick={() => go('/api/stripe/portal', {})}
        title={props.configured ? undefined : 'Connect Stripe to manage billing'}
      >
        {loading ? 'Opening…' : 'Manage billing'}
      </button>
    );
  }

  if (props.isCurrent) {
    return <button type="button" className="btn btn-sm btn-block" disabled>Current plan</button>;
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-sm btn-primary btn-block"
        disabled={!props.configured || loading}
        onClick={() => go('/api/stripe/checkout', { planId: props.planId, interval: 'monthly' })}
        title={props.configured ? undefined : 'Connect Stripe to subscribe'}
      >
        {loading ? 'Redirecting…' : props.configured ? 'Choose plan' : 'Unavailable'}
      </button>
      {error ? <p className="alert alert-error" style={{ marginTop: '.5rem', fontSize: '.8rem' }}>{error}</p> : null}
    </div>
  );
}
