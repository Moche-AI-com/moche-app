'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Blocking modal shown when the host's accepted version of a legal document is
// behind the current published version. Rendered by the dashboard layout only
// when `slugs` is non-empty. Records the acceptance, then refreshes so the
// server-side gate re-evaluates and the modal disappears.
const LABELS: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

export function ReacceptanceGate({ slugs }: { slugs: string[] }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/legal/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs, context: 'reacceptance' }),
      });
      if (!res.ok) throw new Error('Could not record your acceptance.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Updated legal terms"
      data-testid="reacceptance-gate"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,8,14,0.72)', backdropFilter: 'blur(4px)',
        display: 'grid', placeItems: 'center', padding: '1rem',
      }}
    >
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '.5rem' }}>We’ve updated our terms</h2>
        <p className="muted" style={{ fontSize: '.9rem', marginBottom: '1rem' }}>
          Please review and accept the latest version of the following to continue:
        </p>
        <ul style={{ margin: '0 0 1rem', paddingLeft: '1.1rem', fontSize: '.9rem' }}>
          {slugs.map((s) => (
            <li key={s}>
              <Link href={`/legal/${s}`} target="_blank" className="gradient-text">
                {LABELS[s] ?? s}
              </Link>
            </li>
          ))}
        </ul>
        <label style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start', fontSize: '.85rem', marginBottom: '1rem' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: '.15rem' }} data-testid="reacceptance-checkbox" />
          <span>I have read and agree to the updated documents above.</span>
        </label>
        {error ? <p className="alert alert-error" style={{ marginBottom: '.75rem', fontSize: '.8rem' }}>{error}</p> : null}
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!agreed || busy}
          onClick={accept}
          data-testid="reacceptance-submit"
        >
          {busy ? 'Saving…' : 'Agree and continue'}
        </button>
      </div>
    </div>
  );
}
