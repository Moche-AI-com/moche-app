'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { createStayAction, revokeStayAction, type StayActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { GuestChatInbox } from '../guest-chat/GuestChatInbox';
import { StayGuestsManager } from '../guest-chat/StayGuestsManager';

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

export function StaysManager({
  propertyId,
  canManage,
  canAnnounce,
  canLearn,
  initialStayId,
  stays,
}: {
  propertyId: string;
  canManage: boolean;
  canAnnounce: boolean;
  canLearn: boolean;
  initialStayId: string | null;
  stays: Stay[];
}) {
  const [showForm, setShowForm] = useState(false);
  // Selection drives the detail pane: a stay id, 'all' for the property-wide
  // inbox, or null for list-only. Deep links arrive via ?stay=<id>.
  const [selected, setSelected] = useState<string | null>(initialStayId);
  const selectedStay = stays.find((s) => s.id === selected) ?? null;

  function toggle(id: string) {
    setSelected((current) => (current === id ? null : id));
  }

  function selectOnKey(event: React.KeyboardEvent, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(id);
    }
  }

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: selected ? 'minmax(280px, 360px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
            gap: '1rem',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            <div
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => toggle('all')}
              onKeyDown={(event) => selectOnKey(event, 'all')}
              style={{ padding: '1rem', cursor: 'pointer', borderColor: selected === 'all' ? 'var(--teal-deep)' : undefined }}
              data-testid="card-stay-all"
            >
              <strong>All conversations</strong>
              <p className="faint" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>
                Every guest thread for this property in one inbox.
              </p>
            </div>

            {stays.map((s) => (
              <div
                key={s.id}
                className="card"
                role="button"
                tabIndex={0}
                onClick={() => toggle(s.id)}
                onKeyDown={(event) => selectOnKey(event, s.id)}
                style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', cursor: 'pointer', borderColor: selected === s.id ? 'var(--teal-deep)' : undefined }}
                data-testid={`card-stay-${s.id}`}
              >
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
                  <div
                    style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start', flexWrap: 'wrap' }}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <form action={revokeStayAction}>
                      <input type="hidden" name="propertyId" value={propertyId} />
                      <input type="hidden" name="stayId" value={s.id} />
                      <button type="submit" className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} data-testid={`button-revoke-${s.id}`}>Revoke access</button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
              {selectedStay && (
                <>
                  <div className="card" style={{ padding: '1rem' }}>
                    <h2 style={{ fontSize: '1rem', margin: '0 0 .6rem' }}>Guest access</h2>
                    <StayLinkMinter propertyId={propertyId} stayId={selectedStay.id} />
                  </div>
                  <StayGuestsManager propertyId={propertyId} stayId={selectedStay.id} />
                </>
              )}
              <GuestChatInbox
                propertyId={propertyId}
                stayId={selected === 'all' ? null : selected}
                canAnnounce={canAnnounce}
                canLearn={canLearn}
              />
            </div>
          )}
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

// Per-stay magic link: skips OTP (the host vouches by generating it), redeems straight
// into a verified session. Shows the URL + QR once; the raw token is never retrievable later.
function StayLinkMinter({ propertyId, stayId }: { propertyId: string; stayId: string }) {
  const [minted, setMinted] = useState<{ url: string; qrDataUrl: string; linkId: string; code: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  async function mint() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/links`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'stay', stayId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not create the link.');
      setMinted({ url: json.url, qrDataUrl: json.qrDataUrl, linkId: json.linkId, code: json.code ?? null });
      setRevoked(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the link.');
    } finally { setBusy(false); }
  }

  async function regenerateCode() {
    if (!minted) return;
    setCodeBusy(true); setCodeErr(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/links/${minted.linkId}/regenerate-code`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not regenerate the code.');
      setMinted({ ...minted, code: json.code });
      setRevoked(false);
    } catch (e) {
      setCodeErr(e instanceof Error ? e.message : 'Could not regenerate the code.');
    } finally { setCodeBusy(false); }
  }

  async function revokeCode() {
    if (!minted) return;
    setCodeBusy(true); setCodeErr(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/links/${minted.linkId}/revoke-code`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not revoke the code.');
      setRevoked(true);
    } catch (e) {
      setCodeErr(e instanceof Error ? e.message : 'Could not revoke the code.');
    } finally { setCodeBusy(false); }
  }

  if (minted) {
    return (
      <div className="card-2" style={{ padding: '.7rem .8rem', maxWidth: 320 }} data-testid={`stay-link-${stayId}`}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={minted.qrDataUrl} alt="Stay QR code" style={{ width: 84, height: 84, borderRadius: 6, background: '#fff', padding: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'monospace', fontSize: '.7rem', wordBreak: 'break-all' }}>{minted.url}</div>
            <div style={{ display: 'flex', gap: '.35rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(minted.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <a className="btn btn-ghost btn-sm" href={`/dashboard/properties/${propertyId}/welcome-card`} target="_blank" rel="noreferrer">Welcome card</a>
            </div>
          </div>
        </div>

        {minted.code && !revoked && (
          <div style={{ marginTop: '.6rem', padding: '.5rem .6rem', borderRadius: 8, background: 'var(--bg-2, rgba(255,255,255,0.04))', border: '1px solid var(--teal-deep)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
              <div>
                <div className="faint" style={{ fontSize: '.65rem' }}>Visit code (required — shown once)</div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, letterSpacing: '.25rem' }}>{minted.code}</div>
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={regenerateCode} disabled={codeBusy} data-testid={`button-regen-code-${stayId}`}>
                  {codeBusy ? '…' : 'Regenerate'}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={revokeCode} disabled={codeBusy} data-testid={`button-revoke-code-${stayId}`}>
                  Revoke
                </button>
              </div>
            </div>
            {codeErr && <p style={{ color: 'var(--coral)', fontSize: '.68rem', marginTop: '.3rem' }}>{codeErr}</p>}
          </div>
        )}
        {revoked && (
          <div style={{ marginTop: '.6rem', padding: '.5rem .6rem', borderRadius: 8, border: '1px solid var(--coral)' }}>
            <p style={{ fontSize: '.72rem', color: 'var(--coral)' }}>Code revoked — the guest can no longer unlock the concierge with this link.</p>
            <button className="btn btn-ghost btn-sm" onClick={regenerateCode} disabled={codeBusy} style={{ marginTop: '.3rem' }}>
              {codeBusy ? '…' : 'Issue a new code'}
            </button>
          </div>
        )}

        <p className="faint" style={{ fontSize: '.68rem', marginTop: '.4rem' }}>
          {minted.code
            ? 'Shown once — copy the link and code now. Share both with your whole party: opening the link asks for this 4-digit code before the concierge unlocks.'
            : 'Shown once — copy it now. Share with your whole party: anyone who opens it goes straight into the concierge, no email or phone verification needed.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={mint} disabled={busy} data-testid={`button-mint-stay-${stayId}`}>
        {busy ? 'Creating…' : 'Create shareable guest link'}
      </button>
      <p className="faint" style={{ fontSize: '.68rem', marginTop: '.25rem', maxWidth: 320 }}>
        One link for the whole party — comes with a 4-digit visit code guests enter once to unlock the concierge.
      </p>
      {err && <p style={{ color: 'var(--coral)', fontSize: '.72rem', marginTop: '.25rem' }}>{err}</p>}
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
