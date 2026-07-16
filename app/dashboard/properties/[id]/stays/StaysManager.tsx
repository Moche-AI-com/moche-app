'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { createStayAction, revokeStayAction, type StayActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

interface Stay {
  id: string;
  guestDisplayName: string;
  contactType: string;
  contactLast4: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  bookingReference: string | null;
}

const STATUS_BADGE: Record<string, string> = { active: 'badge-teal', upcoming: 'badge', revoked: 'badge-coral', completed: '' };

export function StaysManager({ propertyId, canManage, stays }: { propertyId: string; canManage: boolean; stays: Stay[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      {canManage && !showForm && (
        <button className="btn btn-primary" style={{ marginBottom: '1rem' }} onClick={() => setShowForm(true)} data-testid="button-add-stay">
          + Add stay
        </button>
      )}
      {showForm && canManage && <StayForm propertyId={propertyId} onDone={() => setShowForm(false)} />}

      {stays.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted">No stays yet. Add a booking so the guest can verify and use the concierge.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {stays.map((s) => (
            <div key={s.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }} data-testid={`card-stay-${s.id}`}>
              <div>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{s.guestDisplayName}</strong>
                  <span className={`badge ${STATUS_BADGE[s.status] ?? ''}`}>{s.status}</span>
                </div>
                <p className="faint" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>
                  {fmt(s.checkIn)} → {fmt(s.checkOut)} · {s.contactType} ····{s.contactLast4 ?? '????'}
                  {s.bookingReference ? ` · ${s.bookingReference}` : ''}
                </p>
              </div>
              {canManage && s.status !== 'revoked' && (
                <form action={revokeStayAction}>
                  <input type="hidden" name="propertyId" value={propertyId} />
                  <input type="hidden" name="stayId" value={s.id} />
                  <button type="submit" className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} data-testid={`button-revoke-${s.id}`}>Revoke access</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StayForm({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const [state, formAction] = useFormState<StayActionState, FormData>(createStayAction, {});
  if (state.ok) queueMicrotask(onDone);
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', marginBottom: '1rem', borderColor: 'var(--teal-deep)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
        <h3 style={{ fontSize: '1.05rem' }}>Add stay</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="field">
        <label className="label" htmlFor="guestDisplayName">Guest name</label>
        <input className="input" id="guestDisplayName" name="guestDisplayName" maxLength={120} required data-testid="input-stay-name" />
      </div>
      <div className="field">
        <label className="label" htmlFor="contact">Guest contact (email or phone)</label>
        <input className="input" id="contact" name="contact" maxLength={320} required placeholder="guest@email.com or +1 555 000 0000" data-testid="input-stay-contact" />
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.35rem' }}>Stored hashed. The guest verifies with this exact contact.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="checkIn">Check-in</label>
          <input className="input" id="checkIn" name="checkIn" type="date" required data-testid="input-stay-checkin" />
        </div>
        <div className="field">
          <label className="label" htmlFor="checkOut">Check-out</label>
          <input className="input" id="checkOut" name="checkOut" type="date" required data-testid="input-stay-checkout" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="guestCount">Guests</label>
          <input className="input" id="guestCount" name="guestCount" type="number" min={1} max={50} defaultValue={1} />
        </div>
        <div className="field">
          <label className="label" htmlFor="bookingReference">Booking reference (optional)</label>
          <input className="input" id="bookingReference" name="bookingReference" maxLength={120} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="hostNotes">Host notes (private, never shown to guests)</label>
        <textarea className="textarea" id="hostNotes" name="hostNotes" rows={2} maxLength={4000} />
      </div>
      <SubmitButton>Create stay</SubmitButton>
    </form>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
