'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, UserRound } from 'lucide-react';

type StayGuest = {
  id: string;
  stayId: string;
  displayName: string | null;
  guestLabel: string | null;
  phoneLast4: string | null;
  registered: boolean;
  notificationConsent: boolean;
  pinExpiresAt: string | null;
  revoked: boolean;
  code?: string;
};

// Guest IDs for one stay. The parent (merged Stays tab) owns stay selection, so
// this panel takes a stayId directly instead of keeping its own stay dropdown.
export function StayGuestsManager({ propertyId, stayId }: { propertyId: string; stayId: string }) {
  const [guests, setGuests] = useState<StayGuest[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGuests = useCallback(async () => {
    if (!stayId) return;
    setLoading(true);
    const res = await fetch(`/api/host/properties/${propertyId}/stays/${stayId}/guests`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setGuests(Array.isArray(json.guests) ? json.guests : []);
    } else {
      setError(json.error || 'Could not load guest IDs.');
    }
    setLoading(false);
  }, [propertyId, stayId]);

  useEffect(() => {
    setCreatedCode(null);
    setError(null);
    void loadGuests();
  }, [loadGuests]);

  async function createGuest() {
    if (!stayId || busy) return;
    setBusy(true);
    setError(null);
    setCreatedCode(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/stays/${stayId}/guests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          phone: phone.trim() || undefined,
          code: code.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not create the guest ID.');
        return;
      }
      setCreatedCode(json.guest?.code ?? null);
      setDisplayName('');
      setPhone('');
      setCode('');
      await loadGuests();
    } finally {
      setBusy(false);
    }
  }

  return (
    <details open className="card-2" style={{ padding: '.9rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
        <KeyRound size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />
        Guest IDs for this stay
      </summary>

      <div style={{ marginTop: '.9rem', display: 'grid', gap: '.8rem' }}>
        {loading ? (
          <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading guest IDs…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem' }}>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Guest name (optional)" />
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone (optional)" type="tel" />
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Custom 4-digit ID" inputMode="numeric" />
              <button type="button" className="btn-secondary" onClick={() => void createGuest()} disabled={busy || !stayId}>
                <Plus size={14} aria-hidden /> Create guest ID
              </button>
            </div>

            {createdCode && (
              <div role="status" className="alert alert-success">
                New guest ID: <strong className="portal-code" style={{ fontSize: '1.2rem' }}>{createdCode}</strong>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(createdCode)} style={{ marginLeft: '.6rem' }}>
                  <Copy size={13} aria-hidden /> Copy
                </button>
                <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>Share this code with only that guest. It stops working after the property grace period.</div>
              </div>
            )}

            {error && <p role="alert" style={{ color: 'var(--coral)' }}>{error}</p>}

            <div style={{ display: 'grid', gap: '.45rem' }}>
              {guests.length === 0 ? (
                <p className="muted">No guest IDs yet for this stay.</p>
              ) : (
                guests.map((guest) => (
                  <div key={guest.id} className="card-2" style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', padding: '.65rem' }}>
                    <span>
                      <UserRound size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.3rem' }} />
                      {guest.displayName || guest.guestLabel || 'Guest'}
                      {guest.code ? (
                        <strong className="portal-code" style={{ fontSize: '.9rem', letterSpacing: '.15rem', marginLeft: '.45rem' }}>{guest.code}</strong>
                      ) : null}
                      <span className="muted" style={{ marginLeft: '.45rem', fontSize: '.78rem' }}>
                        {guest.phoneLast4 ? `••••${guest.phoneLast4}` : 'No phone'} · {guest.registered ? 'Registered' : 'Not registered'}
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: '.78rem' }}>{guest.revoked ? 'Revoked' : guest.pinExpiresAt ? `Expires ${new Date(guest.pinExpiresAt).toLocaleDateString()}` : ''}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
