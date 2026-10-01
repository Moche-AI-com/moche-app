'use client';

import { useState } from 'react';
import { Copy, MessageSquare, Share2, Users, X } from 'lucide-react';
import { partyShareText, smsShareHref } from '@/lib/guest/party-invite-url';

type Invite = { url: string; propertyName: string; checkOut: string; spotsLeft: number };

// 'Invite your group' tile for MainMenu. Loads the stay's single live party link
// when the panel opens, so the Share tap calls navigator.share synchronously
// inside the user gesture (Safari drops activation across an await). Copy and
// Text are fallbacks for browsers without the Web Share API. Mounted only for
// signed-in guests (never in host preview).
export function ShareStay({ slug }: { slug?: string }) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function openPanel() {
    setOpen(true);
    if (invite || busy) return;
    // Same fallback MainMenu uses: /g/{slug}/...
    const resolvedSlug = slug ?? window.location.pathname.split('/')[2];
    if (!resolvedSlug) { setError('Could not create an invite.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${encodeURIComponent(resolvedSlug)}/party-invite`, { method: 'POST', credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? 'Could not create an invite.');
      else setInvite(body as Invite);
    } catch {
      setError('Could not create an invite. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  function nativeShare() {
    if (!invite) return;
    navigator
      .share({ title: invite.propertyName, text: partyShareText(invite.propertyName, invite.checkOut), url: invite.url })
      .catch(() => { /* sheet dismissed */ });
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(`${partyShareText(invite.propertyName, invite.checkOut)} ${invite.url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Press and hold the link to copy it.');
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  if (!open) {
    return (
      <button type="button" className="gp-msg-link" onClick={openPanel} data-testid="button-invite-group" style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center' }}>
        <Users size={15} aria-hidden /> Invite your group
      </button>
    );
  }

  const message = invite ? `${partyShareText(invite.propertyName, invite.checkOut)} ${invite.url}` : '';

  return (
    <section className="card" style={{ padding: '1rem', position: 'relative', textAlign: 'left' }} data-testid="invite-group-panel" aria-label="Invite your group">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close" style={{ position: 'absolute', top: '.5rem', right: '.5rem' }}>
        <X size={15} aria-hidden />
      </button>
      <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>Invite your group</h2>
      <p className="gp-muted" style={{ margin: '0 0 .8rem' }}>
        Send this link to the people staying with you. Each person adds their own name, and your host can see who joined.
      </p>
      {busy && <p className="gp-muted">Creating your link…</p>}
      {error && <p className="gp-muted" role="alert">{error}</p>}
      {invite && (
        <>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
            {canNativeShare && (
              <button type="button" className="btn btn-primary" onClick={nativeShare} data-testid="button-invite-share">
                <Share2 size={15} aria-hidden /> Share
              </button>
            )}
            <button type="button" className="btn" onClick={copy} data-testid="button-invite-copy">
              <Copy size={15} aria-hidden /> {copied ? 'Copied' : 'Copy link'}
            </button>
            <a className="btn" href={smsShareHref(message)} data-testid="button-invite-sms">
              <MessageSquare size={15} aria-hidden /> Text
            </a>
          </div>
          <p className="gp-muted" style={{ fontSize: '.8rem', marginTop: '.7rem' }}>
            {invite.spotsLeft} {invite.spotsLeft === 1 ? 'spot' : 'spots'} left · Link stops working after checkout.
          </p>
        </>
      )}
    </section>
  );
}
