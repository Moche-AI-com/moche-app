'use client';

import { useState } from 'react';
import { Copy, MessageSquare, Share2, Users, X } from 'lucide-react';
import { partyShareText, smsShareHref } from '@/lib/guest/party-invite-url';
import { partyT } from '@/lib/guest/party-strings';

type Invite = { url: string; propertyName: string; checkOut: string; spotsLeft: number };

const ERROR_KEYS: Record<string, string> = {
  disabled: 'inviteErrDisabled',
  full: 'inviteErrFull',
  ended: 'inviteErrEnded',
};

// 'Invite your group' tile for MainMenu. Loads the stay's single live party link
// when the panel opens, so the Share tap calls navigator.share synchronously
// inside the user gesture (Safari drops activation across an await). Copy and
// Text are fallbacks for browsers without the Web Share API. Mounted only for
// signed-in guests (never in host preview). All copy follows the guest's
// chosen portal language (lib/guest/party-strings.ts).
export function ShareStay({ slug, language }: { slug?: string; language?: string | null }) {
  const t = partyT(language);
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
    if (!resolvedSlug) { setError(t('inviteErrGeneric')); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/guest/${encodeURIComponent(resolvedSlug)}/party-invite`, { method: 'POST', credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(t(ERROR_KEYS[body.code as string] ?? 'inviteErrGeneric'));
      else setInvite(body as Invite);
    } catch {
      setError(t('inviteErrNetwork'));
    } finally {
      setBusy(false);
    }
  }

  const message = invite
    ? `${partyShareText(t, invite.propertyName, invite.checkOut, language)} ${invite.url}`
    : '';

  function nativeShare() {
    if (!invite) return;
    navigator
      .share({ title: invite.propertyName, text: partyShareText(t, invite.propertyName, invite.checkOut, language), url: invite.url })
      .catch(() => { /* sheet dismissed */ });
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('inviteErrCopy'));
    }
  }

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  if (!open) {
    return (
      <button type="button" className="gp-msg-link" onClick={openPanel} data-testid="button-invite-group" style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'center' }}>
        <Users size={15} aria-hidden /> {t('inviteButton')}
      </button>
    );
  }

  return (
    <section className="card" style={{ padding: '1rem', position: 'relative', textAlign: 'left' }} data-testid="invite-group-panel" aria-label={t('inviteTitle')}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label={t('close')} style={{ position: 'absolute', top: '.5rem', right: '.5rem' }}>
        <X size={15} aria-hidden />
      </button>
      <h2 className="gp-wf-title" style={{ margin: '0 2.25rem .35rem 0' }}>{t('inviteTitle')}</h2>
      <p className="gp-muted" style={{ margin: '0 0 .8rem' }}>{t('inviteSub')}</p>
      {busy && <p className="gp-muted">{t('inviteCreating')}</p>}
      {error && <p className="gp-muted" role="alert">{error}</p>}
      {invite && (
        <>
          <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
            {canNativeShare && (
              <button type="button" className="btn btn-primary" onClick={nativeShare} data-testid="button-invite-share">
                <Share2 size={15} aria-hidden /> {t('inviteShare')}
              </button>
            )}
            <button type="button" className="btn" onClick={copy} data-testid="button-invite-copy">
              <Copy size={15} aria-hidden /> {copied ? t('inviteCopied') : t('inviteCopy')}
            </button>
            <a className="btn" href={smsShareHref(message)} data-testid="button-invite-sms">
              <MessageSquare size={15} aria-hidden /> {t('inviteText')}
            </a>
          </div>
          <p className="gp-muted" style={{ fontSize: '.8rem', marginTop: '.7rem' }}>
            {invite.spotsLeft === 1 ? t('inviteSpotsOne') : t('inviteSpotsMany', { count: invite.spotsLeft })} · {t('inviteExpiry')}
          </p>
        </>
      )}
    </section>
  );
}
