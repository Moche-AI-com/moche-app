'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { Mail, MessageSquareText, Send } from 'lucide-react';
import { createStayAction, revokeStayAction, type StayActionState } from './actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { GuestChatInbox } from '../guest-chat/GuestChatInbox';
import { StayGuestsManager } from '../guest-chat/StayGuestsManager';
import { portalCodeStatus } from '@/lib/guest/portal-status';
import { STATUS_BADGE } from '@/lib/constants';

interface Stay {
  id: string;
  guestDisplayName: string;
  contactType: string;
  contactLast4: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  bookingReference: string | null;
  /** Portal state for the stay's latest coded link. `code` is present when the
      link was minted with the Vault envelope (Ticket 2B); older links show masked. */
  portal?: { linkId: string; code?: string | null; codeExpiresAt: string | null; codeRevokedAt: string | null } | null;
}

const PORTAL_TONE: Record<string, string> = { active: 'var(--teal)', expired: 'var(--coral)', revoked: 'var(--coral)' };

export function StaysManager({
  propertyId,
  canManage,
  canAnnounce,
  initialStayId,
  stays,
}: {
  propertyId: string;
  canManage: boolean;
  canAnnounce: boolean;
  initialStayId: string | null;
  stays: Stay[];
}) {
  const [showForm, setShowForm] = useState(false);
  // Selection drives the detail pane: a stay id, 'all' for the property-wide
  // inbox, or null for list-only. Deep links arrive via ?stay=<id>.
  const [selected, setSelected] = useState<string | null>(initialStayId);
  const selectedStay = stays.find((s) => s.id === selected) ?? null;
  // portalCodeStatus takes a non-null PortalCodeState — guard the optional chain.
  const selectedPortalState = selectedStay?.portal ? portalCodeStatus(selectedStay.portal) : null;

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
        <div className={`stays-shell${selected ? ' has-selection' : ''}`}>
          <div className="stay-list">
            <div
              className={`card stay-card${selected === 'all' ? ' is-selected' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => toggle('all')}
              onKeyDown={(event) => selectOnKey(event, 'all')}
              data-testid="card-stay-all"
            >
              <div>
                <strong>All conversations</strong>
                <p className="faint" style={{ fontSize: '.8rem', marginTop: '.25rem' }}>
                  Every guest thread for this property in one inbox.
                </p>
              </div>
            </div>

            {stays.map((s) => {
              const portalState = s.portal ? portalCodeStatus(s.portal) : null;
              return (
                <div
                  key={s.id}
                  className={`card stay-card${selected === s.id ? ' is-selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(s.id)}
                  onKeyDown={(event) => selectOnKey(event, s.id)}
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
                    {portalState && s.portal && (
                      <p className="faint" style={{ fontSize: '.76rem', marginTop: '.2rem' }} data-testid={`portal-status-${s.id}`}>
                        Stay code{' '}
                        {s.portal.code
                          ? <strong className="portal-code" style={{ fontSize: '.85rem', letterSpacing: '.15rem' }}>{s.portal.code}</strong>
                          : '••••'}
                        {' '}· <span style={{ color: PORTAL_TONE[portalState], fontWeight: 600 }}>{portalState}</span>
                        {s.portal.codeExpiresAt ? ` · expires ${fmt(s.portal.codeExpiresAt)}` : ''}
                      </p>
                    )}
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
              );
            })}
          </div>

          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
              {selectedStay && (
                <>
                  <div className="card" style={{ padding: '1rem' }}>
                    <h2 style={{ fontSize: '1rem', margin: '0 0 .6rem' }}>Stay access code</h2>
                    <p className="faint" style={{ fontSize: '.8rem', margin: '0 0 .6rem' }}>
                      One code covers every guest on this stay. Guests enter it once per device, then their session is remembered.
                    </p>
                    {selectedStay.portal ? (
                      <div>
                        <p className="faint" style={{ fontSize: '.8rem', margin: '0 0 .5rem' }}>
                          <span style={{ color: PORTAL_TONE[portalCodeStatus(selectedStay.portal)], fontWeight: 600 }}>
                            {portalCodeStatus(selectedStay.portal)}
                          </span>
                          {selectedStay.portal.codeExpiresAt ? ` · code expires ${fmt(selectedStay.portal.codeExpiresAt)}` : ''}
                        </p>
                        {selectedStay.portal.code ? (
                          <div className="portal-code-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
                            <div>
                              <div className="faint" style={{ fontSize: '.65rem' }}>Access code</div>
                              <div className="portal-code" style={{ fontSize: '1.3rem' }} data-testid={`portal-code-${selectedStay.id}`}>{selectedStay.portal.code}</div>
                            </div>
                            <CopyCodeButton code={selectedStay.portal.code} />
                          </div>
                        ) : (
                          <p className="faint" style={{ fontSize: '.72rem', margin: '0 0 .5rem' }}>
                            This code was minted before codes became re-viewable, so it shows masked. Regenerate to issue a fresh, visible code.
                          </p>
                        )}
                        <PortalCodeRegenerator propertyId={propertyId} stayId={selectedStay.id} linkId={selectedStay.portal.linkId} />
                      </div>
                    ) : (
                      // Stays created before auto-mint keep the manual minter as fallback.
                      <StayLinkMinter propertyId={propertyId} stayId={selectedStay.id} />
                    )}
                  </div>
                  <ShareStayPanel
                    propertyId={propertyId}
                    stayId={selectedStay.id}
                    enabled={Boolean(selectedStay.portal?.code) && selectedPortalState === 'active'}
                  />
                  <StayGuestsManager propertyId={propertyId} stayId={selectedStay.id} />
                </>
              )}
              <GuestChatInbox
                propertyId={propertyId}
                stayId={selected === 'all' ? null : selected}
                canAnnounce={canAnnounce}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? 'Copied!' : 'Copy code'}
    </button>
  );
}

type ShareInvite = {
  id: string;
  channel: 'sms' | 'email';
  destinationLast4: string | null;
  status: 'queued' | 'sent' | 'failed';
  createdAt: string;
};

// Share this stay's portal link + access code with a guest. Moche-AI sends the
// message itself (Twilio SMS / Resend email), branded as Moche-AI on the
// host's behalf, so the guest never has to hunt for the link.
function ShareStayPanel({ propertyId, stayId, enabled }: { propertyId: string; stayId: string; enabled: boolean }) {
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invites, setInvites] = useState<ShareInvite[]>([]);

  const loadInvites = useCallback(async () => {
    const res = await fetch(`/api/host/properties/${propertyId}/stays/${stayId}/share`, { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setInvites(Array.isArray(json.invites) ? json.invites : []);
  }, [propertyId, stayId]);

  useEffect(() => {
    setInvites([]);
    setError(null);
    setNotice(null);
    void loadInvites();
  }, [loadInvites]);

  async function send() {
    if (busy || !destination.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/stays/${stayId}/share`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, destination: destination.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not send the invite.');
        return;
      }
      setNotice(channel === 'sms'
        ? 'Text sent — your guest gets the portal link and stay code in a moment.'
        : 'Email sent — your guest gets the portal link and stay code in a moment.');
      setDestination('');
      await loadInvites();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '1rem' }} data-testid="share-stay-panel">
      <h2 style={{ fontSize: '1rem', margin: '0 0 .4rem' }}>Share with guests</h2>
      <p className="faint" style={{ fontSize: '.8rem', margin: '0 0 .65rem' }}>
        Moche-AI texts or emails your guest the guest-portal link and this stay’s access code for you.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.6rem', alignItems: 'center' }}>
        <select
          className="select"
          value={channel}
          onChange={(event) => setChannel(event.target.value as 'sms' | 'email')}
          aria-label="Delivery channel"
          data-testid="share-channel"
        >
          <option value="sms">Text message</option>
          <option value="email">Email</option>
        </select>
        <input
          className="input"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder={channel === 'sms' ? '+1 555 000 0000' : 'guest@email.com'}
          inputMode={channel === 'sms' ? 'tel' : 'email'}
          aria-label={channel === 'sms' ? 'Guest phone number' : 'Guest email address'}
          data-testid="share-destination"
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => void send()}
          disabled={busy || !enabled || !destination.trim()}
          data-testid="share-send"
        >
          <Send size={14} aria-hidden /> {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      {!enabled && (
        <p className="faint" style={{ fontSize: '.72rem', margin: '.45rem 0 0' }}>
          This stay needs an active access code before you can share it — use Regenerate code above.
        </p>
      )}
      {notice && <p role="status" style={{ color: 'var(--teal)', fontSize: '.8rem', margin: '.5rem 0 0' }}>{notice}</p>}
      {error && <p role="alert" style={{ color: 'var(--coral)', fontSize: '.8rem', margin: '.5rem 0 0' }}>{error}</p>}
      {invites.length > 0 && (
        <div style={{ display: 'grid', gap: '.35rem', marginTop: '.65rem' }} data-testid="share-log">
          {invites.map((invite) => (
            <div key={invite.id} className="faint" style={{ fontSize: '.74rem', display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {invite.channel === 'email' ? <Mail size={12} aria-hidden /> : <MessageSquareText size={12} aria-hidden />}
              <span>{invite.channel === 'email' ? 'Email' : 'Text'} to ••••{invite.destinationLast4 ?? '????'}</span>
              <span className={`badge ${invite.status === 'sent' ? 'badge-teal' : invite.status === 'failed' ? 'badge-coral' : ''}`}>{invite.status}</span>
              <span>{new Date(invite.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StayForm({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const [state, formAction] = useFormState<StayActionState, FormData>(createStayAction, {});
  const [copied, setCopied] = useState(false);
  // Auto-close only when there is nothing to hand off: a freshly minted access
  // code confirmation stays open until the host acknowledges it.
  if (state.ok && !state.portalCode && !state.portalError) queueMicrotask(onDone);

  if (state.ok && state.portalCode) {
    return (
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem', borderColor: 'var(--teal-deep)' }} data-testid="stay-portal-confirmation">
        <h3 style={{ fontSize: '1.05rem', marginBottom: '.4rem' }}>Stay created — guest portal ready</h3>
        <p className="muted" style={{ fontSize: '.85rem', marginBottom: '.9rem' }}>
          Share the link and code with your guests — one code covers the whole party. Opening the link asks for this 4-digit code before the concierge unlocks.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="portal-code-box">
            <div className="faint" style={{ fontSize: '.65rem' }}>Stay access code</div>
            <div className="portal-code" style={{ fontSize: '1.5rem' }} data-testid="stay-portal-code">{state.portalCode}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="card-2 portal-url" style={{ padding: '.55rem .75rem' }} data-testid="stay-portal-url">{state.portalUrl}</div>
            <div style={{ display: 'flex', gap: '.4rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { if (state.portalUrl) { void navigator.clipboard?.writeText(state.portalUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
                data-testid="button-copy-portal-url"
              >
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <a className="btn btn-ghost btn-sm" href={`/dashboard/properties/${propertyId}/welcome-card`} target="_blank" rel="noreferrer">Welcome card</a>
            </div>
          </div>
        </div>
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.7rem' }}>
          The code stays re-viewable from the stay’s access panel for the life of the stay — no regenerate loop.
          {state.portalCodeExpiresAt ? ` It works until ${fmt(state.portalCodeExpiresAt)} (check-out + grace).` : ''}
        </p>
        <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: '.8rem' }} onClick={onDone} data-testid="button-portal-confirmation-done">
          Done
        </button>
      </div>
    );
  }

  if (state.ok && state.portalError) {
    return (
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }} data-testid="stay-portal-error">
        <div className="alert alert-error" style={{ fontSize: '.85rem' }}>{state.portalError}</div>
        <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: '.8rem' }} onClick={onDone}>Done</button>
      </div>
    );
  }

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

// Regenerating the access code is deliberately a small secondary action: the
// primary flow is the automatic mint at stay creation (Ticket 3). The new code
// replaces the old one immediately and stays re-viewable from the access panel.
function PortalCodeRegenerator({ propertyId, stayId, linkId }: { propertyId: string; stayId: string; linkId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/host/properties/${propertyId}/links/${linkId}/regenerate-code`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not regenerate the code.');
      setCode(json.code ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not regenerate the code.');
    } finally { setBusy(false); }
  }

  if (code) {
    return (
      <div className="portal-code-box" data-testid={`stay-code-regenerated-${stayId}`}>
        <div className="faint" style={{ fontSize: '.65rem' }}>New access code</div>
        <div className="portal-code" style={{ fontSize: '1.3rem' }}>{code}</div>
      </div>
    );
  }
  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--coral)' }} onClick={regenerate} disabled={busy} data-testid={`button-regen-code-${stayId}`}>
        {busy ? '…' : 'Regenerate code'}
      </button>
      {err && <p style={{ color: 'var(--coral)', fontSize: '.72rem', marginTop: '.25rem' }}>{err}</p>}
    </div>
  );
}

// Per-stay magic link: skips OTP (the host vouches by generating it), redeems straight
// into a verified session. Shows the URL + QR once; the raw token is never retrievable later.
// Since Ticket 3 this renders only for stays created before auto-mint existed.
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
            <div className="portal-url">{minted.url}</div>
            <div style={{ display: 'flex', gap: '.35rem', marginTop: '.4rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(minted.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <a className="btn btn-ghost btn-sm" href={`/dashboard/properties/${propertyId}/welcome-card`} target="_blank" rel="noreferrer">Welcome card</a>
            </div>
          </div>
        </div>

        {minted.code && !revoked && (
          <div className="portal-code-box" style={{ marginTop: '.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem' }}>
              <div>
                <div className="faint" style={{ fontSize: '.65rem' }}>Access code (required)</div>
                <div className="portal-code" style={{ fontSize: '1.3rem' }}>{minted.code}</div>
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
            ? 'Copy the link and code now. Share both with your whole party: opening the link asks for this 4-digit code before the concierge unlocks.'
            : 'Copy it now. Share with your whole party: anyone who opens it goes straight into the concierge, no email or phone verification needed.'}
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
        One link for the whole party — comes with a 4-digit stay code guests enter once per device to unlock the concierge.
      </p>
      {err && <p style={{ color: 'var(--coral)', fontSize: '.72rem', marginTop: '.25rem' }}>{err}</p>}
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
