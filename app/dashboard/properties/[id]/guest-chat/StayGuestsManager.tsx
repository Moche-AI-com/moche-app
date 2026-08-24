'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserRound, Users } from 'lucide-react';

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

// Guests who have joined this stay. Under the one-code model there is nothing
// to create here: every guest uses the same stay access code and adds their
// name the first time they open the portal. Rows showing a code are legacy
// per-guest IDs minted before the merge and keep working until they expire.
export function StayGuestsManager({ propertyId, stayId }: { propertyId: string; stayId: string }) {
  const [guests, setGuests] = useState<StayGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGuests = useCallback(async () => {
    if (!stayId) return;
    setLoading(true);
    const res = await fetch(`/api/host/properties/${propertyId}/stays/${stayId}/guests`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setGuests(Array.isArray(json.guests) ? json.guests : []);
    } else {
      setError(json.error || 'Could not load guests.');
    }
    setLoading(false);
  }, [propertyId, stayId]);

  useEffect(() => {
    setError(null);
    void loadGuests();
  }, [loadGuests]);

  return (
    <details open className="card-2" style={{ padding: '.9rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
        <Users size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: '.35rem' }} />
        Guests on this stay
      </summary>

      <p className="faint" style={{ fontSize: '.78rem', margin: '.6rem 0 0' }}>
        Everyone in the party uses the same stay access code. Guests add their name the first time they open the portal, and their session is remembered on that device.
      </p>

      <div style={{ marginTop: '.8rem', display: 'grid', gap: '.45rem' }}>
        {loading ? (
          <p className="muted"><Loader2 size={15} className="spin" aria-hidden /> Loading guests…</p>
        ) : guests.length === 0 ? (
          <p className="muted">No guests have joined yet. Share the stay code to get them in.</p>
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
        {error && <p role="alert" style={{ color: 'var(--coral)' }}>{error}</p>}
      </div>
    </details>
  );
}
