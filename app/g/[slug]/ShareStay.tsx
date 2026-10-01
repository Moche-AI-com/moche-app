'use client';

import { useState } from 'react';
import { Check, Copy, Link2, MessageSquare, Share2, Users, X } from 'lucide-react';
import { partyShareText, smsShareHref } from '@/lib/guest/party-invite-url';
import { partyT } from '@/lib/guest/party-strings';

type Invite = { url: string; propertyName: string; checkOut: string; spotsLeft: number };

const ERROR_KEYS: Record<string, string> = {
  disabled: 'inviteErrDisabled',
  full: 'inviteErrFull',
  ended: 'inviteErrEnded',
};

// Scoped to .gp-v2 so it only applies inside the guest portal shell, layered on
// the shared portal design system (gp-card, gp-btn, gp-icon-btn, gp-error).
// Colors come from the portal's semantic variables, so both themes and the
// property's brand color are respected; no hard-coded white surfaces.
const SHARE_CSS = `
.gp-v2 .gp-share { margin: 18px 0 4px; }
.gp-v2 .gp-share-trigger { gap: 10px; }
.gp-v2 .gp-share-card { text-align: left; animation: gp-rise .25s ease both; }
.gp-v2 .gp-share-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gp-v2 .gp-share-title { display: flex; align-items: center; gap: 8px; margin: 0; }
.gp-v2 .gp-share-close { width: 36px; height: 36px; border-radius: 10px; }
.gp-v2 .gp-share-sub { font-size: .9rem; color: var(--gp-muted); line-height: 1.45; margin: 8px 0 14px; }
.gp-v2 .gp-share-status { font-size: .88rem; color: var(--gp-muted); margin: 0 0 12px; }
.gp-v2 .gp-share-error { margin: 0 0 12px; }
.gp-v2 .gp-share-link { display: flex; align-items: center; gap: 8px; background: var(--gp-surface-2); border: 1px solid var(--gp-border-strong); border-radius: 12px; padding: 11px 12px; margin-bottom: 12px; color: var(--gp-icon); }
.gp-v2 .gp-share-link span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .86rem; color: var(--gp-muted); }
.gp-v2 .gp-share-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gp-v2 .gp-share-actions .gp-btn { padding: 13px 14px; font-size: .95rem; text-decoration: none; box-sizing: border-box; }
.gp-v2 .gp-share-wide { grid-column: 1 / -1; }
.gp-v2 .gp-share-meta { font-size: .8rem; color: var(--gp-faint); text-align: center; margin: 12px 0 0; }
`;

function linkPreview(url: string): string {
  // Domain + path only: the invite token lives in the fragment and is never shown.
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '';
  }
}

// 'Invite your group' for MainMenu. Loads the stay's single live party link when
// the panel opens, so the Share tap calls navigator.share synchronously inside
// the user gesture (Safari drops activation across an await). Copy link and
// Text are first-class buttons; on browsers without the Web Share API (most
// desktops) Copy link becomes the primary action. Mounted only for signed-in
// guests (never in host preview). All copy follows the guest's chosen portal
// language (lib/guest/party-strings.ts).
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
  const preview = invite ? linkPreview(invite.url) : '';

  return (
    <div className="gp-share">
      <style>{SHARE_CSS}</style>
      {!open ? (
        <button type="button" className="gp-btn gp-btn-ghost gp-share-trigger" onClick={openPanel} data-testid="button-invite-group">
          <Users size={18} aria-hidden /> {t('inviteButton')}
        </button>
      ) : (
        <section className="gp-card gp-share-card" data-testid="invite-group-panel" aria-label={t('inviteTitle')}>
          <div className="gp-share-head">
            <h2 className="gp-wf-title gp-share-title"><Users size={18} aria-hidden /> {t('inviteTitle')}</h2>
            <button type="button" className="gp-icon-btn gp-share-close" onClick={() => setOpen(false)} aria-label={t('close')}>
              <X size={16} aria-hidden />
            </button>
          </div>
          <p className="gp-share-sub">{t('inviteSub')}</p>
          {busy && <p className="gp-share-status" role="status">{t('inviteCreating')}</p>}
          {error && <div className="gp-error gp-share-error" role="alert">{error}</div>}
          {invite && (
            <>
              {preview && (
                <div className="gp-share-link" data-testid="invite-link-preview">
                  <Link2 size={16} aria-hidden />
                  <span>{preview}</span>
                </div>
              )}
              <div className="gp-share-actions">
                {canNativeShare && (
                  <button type="button" className="gp-btn gp-btn-primary gp-share-wide" onClick={nativeShare} data-testid="button-invite-share">
                    <Share2 size={17} aria-hidden /> {t('inviteShare')}
                  </button>
                )}
                <button
                  type="button"
                  className={`gp-btn ${canNativeShare ? 'gp-btn-ghost' : 'gp-btn-primary'}`}
                  onClick={copy}
                  data-testid="button-invite-copy"
                  aria-live="polite"
                >
                  {copied ? <Check size={17} aria-hidden /> : <Copy size={17} aria-hidden />} {copied ? t('inviteCopied') : t('inviteCopy')}
                </button>
                <a className="gp-btn gp-btn-ghost" href={smsShareHref(message)} data-testid="button-invite-sms">
                  <MessageSquare size={17} aria-hidden /> {t('inviteText')}
                </a>
              </div>
              <p className="gp-share-meta">
                {invite.spotsLeft === 1 ? t('inviteSpotsOne') : t('inviteSpotsMany', { count: invite.spotsLeft })} · {t('inviteExpiry')}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
