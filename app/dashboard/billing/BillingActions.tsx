'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PlanId } from '@/lib/constants';

type Props =
  | { mode: 'checkout'; planId: PlanId; isCurrent: boolean; configured: boolean }
  | { mode: 'portal'; configured: boolean };

export function BillingActions(props: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

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
      {/* Clickwrap: unchecked by default, required before a paid subscription starts. */}
      <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.75rem', marginBottom: '.6rem' }} className="muted">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: '.15rem' }} data-testid="checkout-accept-terms" />
        <span>
          I agree to the{' '}
          <Link href="/legal/terms" target="_blank" className="gradient-text">Terms</Link>,{' '}
          <Link href="/legal/privacy" target="_blank" className="gradient-text">Privacy Policy</Link>, and{' '}
          <Link href="/legal/dpa" target="_blank" className="gradient-text">Data Processing Addendum</Link>.
        </span>
      </label>
      <button
        type="button"
        className="btn btn-sm btn-primary btn-block"
        disabled={!props.configured || loading || !agreed}
        onClick={() => go('/api/stripe/checkout', { planId: props.planId, interval: 'monthly', acceptTerms: true })}
        title={props.configured ? undefined : 'Connect Stripe to subscribe'}
      >
        {loading ? 'Redirecting…' : props.configured ? 'Choose plan' : 'Unavailable'}
      </button>
      {error ? <p className="alert alert-error" style={{ marginTop: '.5rem', fontSize: '.8rem' }}>{error}</p> : null}
    </div>
  );
}
