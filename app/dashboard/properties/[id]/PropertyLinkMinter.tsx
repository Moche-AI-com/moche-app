'use client';

import { useState } from 'react';

interface Minted {
  url: string;
  qrDataUrl: string;
}

// Mints a reusable, OTP-gated property QR (posted in the home). Distinct from the
// per-stay magic links created under Stays.
export function PropertyLinkMinter({ propertyId }: { propertyId: string }) {
  const [minted, setMinted] = useState<Minted | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function mint() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/links`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'property', requireOtp: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not create the link.');
      setMinted({ url: json.url, qrDataUrl: json.qrDataUrl });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the link.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
      <h2 style={{ fontSize: '1.05rem', marginBottom: '.6rem' }}>Reusable property QR</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.75rem' }}>
        A long-lived QR to print and post in the home. Guests scan it and verify once with the
        contact on their booking — the property is pre-filled for them.
      </p>
      {err && <div className="alert alert-error" style={{ fontSize: '.82rem', marginBottom: '.6rem' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-primary btn-sm" onClick={mint} disabled={busy} data-testid="button-mint-property-link">
          {busy ? 'Generating…' : minted ? 'Regenerate QR' : 'Generate reusable QR'}
        </button>
        <a href={`/dashboard/properties/${propertyId}/welcome-card`} className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
          Print welcome card →
        </a>
      </div>
      {minted && (
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={minted.qrDataUrl} alt="Property QR code" style={{ width: 140, height: 140, borderRadius: 8, background: '#fff', padding: 6 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-2" style={{ padding: '.55rem .75rem', fontFamily: 'monospace', fontSize: '.78rem', wordBreak: 'break-all' }}>{minted.url}</div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '.5rem' }}
              onClick={() => { void navigator.clipboard?.writeText(minted.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
              Save this now — the link is shown once and cannot be retrieved later.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
