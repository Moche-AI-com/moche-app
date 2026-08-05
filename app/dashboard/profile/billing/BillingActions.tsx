'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { PlanId } from '@/lib/constants';

type Props =
  | { mode: 'checkout'; planId: PlanId; isCurrent: boolean; configured: boolean }
  | { mode: 'portal'; configured: boolean }
  | { mode: 'refund'; configured: boolean };

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

  if (props.mode === 'refund') {
    return <RefundAction configured={props.configured} />;
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
          <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="gradient-text">Terms</Link>,{' '}
          <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="gradient-text">Privacy Policy</Link>,{' '}
          <Link href="/legal/acceptable-use" target="_blank" rel="noopener noreferrer" className="gradient-text">Acceptable Use Policy</Link>, and{' '}
          <Link href="/legal/dpa" target="_blank" rel="noopener noreferrer" className="gradient-text">Data Processing Addendum</Link>.
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

interface Eligibility {
  eligible: boolean;
  reason: string;
  interval: 'month' | 'year' | 'unknown';
  amount: number | null;
  currency: string | null;
  windowEndsAt: string | null;
}

function fmtAmount(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

// Self-serve refund per /legal/refund. Checks eligibility on open, then a two-tap
// confirm before issuing. Ineligible cases show the policy reason and route to support.
function RefundAction({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open || elig || loading) return;
    setLoading(true);
    fetch('/api/stripe/refund', { method: 'GET' })
      .then(async (res) => {
        const data = (await res.json()) as Eligibility & { error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Could not check refund eligibility.');
          return;
        }
        setElig(data);
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  }, [open, elig, loading]);

  async function issue() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not process the refund. Please contact support.');
        return;
      }
      setDone(data.message ?? 'Your refund has been issued.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (!configured) return null;

  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)} data-testid="refund-open">
        Request a refund
      </button>
    );
  }

  return (
    <div style={{ maxWidth: 460 }}>
      {done ? (
        <p className="alert alert-info" style={{ fontSize: '.82rem', margin: 0 }}>{done}</p>
      ) : (
        <>
          {loading && !elig ? (
            <p className="faint" style={{ fontSize: '.82rem', margin: '.25rem 0' }}>Checking your refund eligibility…</p>
          ) : null}
          {elig ? (
            <>
              <p className={elig.eligible ? 'muted' : 'faint'} style={{ fontSize: '.82rem', margin: '.25rem 0 .6rem', lineHeight: 1.5 }}>
                {elig.reason}
                {elig.eligible && elig.amount != null ? (
                  <> You&rsquo;ll be refunded <strong>{fmtAmount(elig.amount, elig.currency)}</strong>.</>
                ) : null}
              </p>
              {elig.eligible ? (
                confirming ? (
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-sm btn-danger" disabled={loading} onClick={issue} data-testid="refund-confirm">
                      {loading ? 'Processing…' : 'Confirm refund & cancel'}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={loading} onClick={() => setConfirming(false)}>
                      Keep my plan
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setConfirming(true)} data-testid="refund-request">
                    Request refund
                  </button>
                )
              ) : (
                <Link href="/legal/support" className="btn btn-sm btn-ghost">Contact support</Link>
              )}
            </>
          ) : null}
          {error ? <p className="alert alert-error" style={{ marginTop: '.5rem', fontSize: '.8rem' }}>{error}</p> : null}
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.6rem' }}>
            See our <Link href="/legal/refund" target="_blank" rel="noopener noreferrer" className="gradient-text">Refund Policy</Link>.
          </p>
        </>
      )}
    </div>
  );
}
