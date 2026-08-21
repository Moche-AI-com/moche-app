'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, UserRound } from 'lucide-react';

type Stay = {
  id: string;
  guest_display_name: string;
  check_in: string;
  check_out: string;
  status: string;
};

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

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function StayGuestsManager({ propertyId }: { propertyId: string }) {
  const [stays, setStays] = useState<Stay[]>([]);
  const [stayId, setStayId] = useState('');
  const [guests, setGuests] = useState<StayGuest[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/host/properties/${propertyId}/stays`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load_failed'))))
      .then((json) => {
        const rows = Array.isArray(json.stays) ? json.stays : [];
        setStays(rows);
        setStayId(rows[0]?.id ?? '');
      })
      .catch(() => setError('Could not load stays.'))
      .finally(() => setLoading(false));
  }, [propertyId]);

  const loadGuests = useCallback(async (selectedStayId: string) => {
    if (!selectedStayId) return;
    const res = await fetch(`/api/host/properties/${propertyId}/stays/${selectedStayId}/guests`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setGuests(Array.isArray(json.guests) ? json.guests : []);
  }, [propertyId]);

  useEffect(() => {
    void loadGuests(stayId);
  }, [stayId, loadGuests]);

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
      await loadGuests(stayId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '.9rem', background: 'rgba(255,255,255,.035)' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
        <KeyRound size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />
        Guest IDs for this stay
      </summary>

      <div style={{ marginTop: '.9rem', display: 'grid', gap: '.8rem' }}>
        {loading ? (
          <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading stays…</p>
        ) : stays.length === 0 ? (
          <p className="muted">No active or upcoming stays are available.</p>
        ) : (
          <>
            <label>
              Stay
              <select value={stayId} onChange={(event) => setStayId(event.target.value)} style={{ width: '100%' }}>
                {stays.map((stay) => (
                  <option key={stay.id} value={stay.id}>
                    {stay.guest_display_name} · {dateLabel(stay.check_in)}–{dateLabel(stay.check_out)} · {stay.status}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.6rem' }}>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Guest name (optional)" />
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone (optional)" type="tel" />
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Custom 4-digit ID" inputMode="numeric" />
              <button type="button" onClick={() => void createGuest()} disabled={busy || !stayId}>
                <Plus size={14} aria-hidden /> Create guest ID
              </button>
            </div>

            {createdCode && (
              <div role="status" style={{ border: '1px solid rgba(51,230,212,.35)', background: 'rgba(51,230,212,.1)', borderRadius: 12, padding: '.75rem' }}>
                New guest ID: <strong style={{ fontSize: '1.2rem', letterSpacing: '.12em' }}>{createdCode}</strong>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(createdCode)} style={{ marginLeft: '.6rem' }}>
                  <Copy size={13} aria-hidden /> Copy
                </button>
                <div className="muted" style={{ fontSize: '.78rem', marginTop: '.25rem' }}>Share this code with only that guest. It stops working after the property grace period.</div>
              </div>
            )}

            {error && <p role="alert" style={{ color: '#ffb08f' }}>{error}</p>}

            <div style={{ display: 'grid', gap: '.45rem' }}>
              {guests.length === 0 ? (
                <p className="muted">No guest IDs yet for the selected stay.</p>
              ) : (
                guests.map((guest) => (
                  <div key={guest.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: '.65rem' }}>
                    <span>
                      <UserRound size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.3rem' }} />
                      {guest.displayName || guest.guestLabel || 'Guest'}
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
