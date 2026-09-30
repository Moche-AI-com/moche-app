'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { BellRing, Mail, MessageSquareText, Smartphone } from 'lucide-react';
import type { PortalT } from '@/lib/guest/portal-strings';
import { PushOptIn } from './PushOptIn';

// Shown right after a question is escalated to the host. The host has ALREADY
// been notified (escalation never waits on guest contact details); this card
// only asks how the guest wants to hear back. Channel order mirrors
// notifyGuestConversationReply(): device push, then verified SMS, then a
// confirmed email address. The answer always lands in the portal thread too.
function tr(t: PortalT, key: string, fallback: string): string {
  // portalT returns the key itself when a locale lacks it; degrade to English.
  const value = t(key);
  return value === key ? fallback : value;
}

type Platform = 'push' | 'ios_install' | 'none';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'none';
  const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasPush && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'push';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios_install';
  return 'none';
}

export function EscalationFollowUp(props: { slug: string; t: PortalT; onOpenHostChat: () => void }) {
  const { t } = props;
  const [platform, setPlatform] = useState<Platform>('none');
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  useEffect(() => { setPlatform(detectPlatform()); }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!consent || !email.trim() || emailState === 'sending') return;
    setEmailState('sending'); setEmailMsg(null);
    try {
      const res = await fetch(`/api/guest/${props.slug}/notify-email`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, consent: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) { setEmailState('sent'); setEmailMsg(typeof json.email === 'string' ? json.email : null); }
      else { setEmailState('error'); setEmailMsg(typeof json.error === 'string' ? json.error : tr(t, 'followEmailError', 'Something went wrong. Please try again.')); }
    } catch {
      setEmailState('error'); setEmailMsg(tr(t, 'followEmailError', 'Something went wrong. Please try again.'));
    }
  }

  return <div className="gp-notice" role="region" aria-label={tr(t, 'followAria', 'Get notified when your host answers')} style={{ display: 'block' }} data-testid="escalation-follow-up">
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
      <BellRing size={17} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <strong>{tr(t, 'followTitle', 'Your host has been notified.')}</strong>
        <p className="gp-muted" style={{ margin: '.25rem 0 .5rem' }}>
          {tr(t, 'followSub', 'Want a heads-up when they answer? Their reply will also appear here and in Host chat.')}
        </p>
        {platform === 'push' && <PushOptIn slug={props.slug} t={t} />}
        {platform === 'ios_install' && <p className="gp-muted" style={{ margin: '.25rem 0 .5rem', display: 'flex', gap: '.35rem', alignItems: 'center' }}>
          <Smartphone size={15} aria-hidden />
          {tr(t, 'followIosHint', 'On iPhone: tap Share, then "Add to Home Screen" to get alerts on this device.')}
        </p>}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '.35rem' }}>
          <button type="button" className="gp-msg-link" onClick={props.onOpenHostChat} data-testid="button-follow-sms" style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
            <MessageSquareText size={15} aria-hidden /> {tr(t, 'followSms', 'Get a text instead')}
          </button>
          {emailState !== 'sent' && <button type="button" className="gp-msg-link" onClick={() => setEmailOpen((open) => !open)} aria-expanded={emailOpen} data-testid="button-follow-email" style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
            <Mail size={15} aria-hidden /> {tr(t, 'followEmail', 'Email me instead')}
          </button>}
        </div>
        {emailOpen && emailState !== 'sent' && <form onSubmit={submitEmail} style={{ marginTop: '.6rem', display: 'grid', gap: '.45rem' }} data-testid="form-follow-email">
          <label htmlFor="follow-email" className="sr-only">{tr(t, 'followEmailLabel', 'Your email')}</label>
          <input id="follow-email" className="gp-input" type="email" inputMode="email" autoComplete="email" required maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)} placeholder={tr(t, 'followEmailLabel', 'Your email')} />
          <label style={{ display: 'flex', gap: '.45rem', alignItems: 'flex-start', fontSize: '.85rem' }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
            <span>{tr(t, 'followEmailConsent', 'Email me when my host replies during this stay. I can stop anytime.')}</span>
          </label>
          <button type="submit" className="gp-btn gp-btn-accent" disabled={!consent || !email.trim() || emailState === 'sending'}>
            {emailState === 'sending' ? tr(t, 'followEmailSending', 'Sending…') : tr(t, 'followEmailSubmit', 'Send confirmation link')}
          </button>
          {emailState === 'error' && emailMsg && <p role="alert" className="gp-alert-text" style={{ margin: 0 }}>{emailMsg}</p>}
        </form>}
        {emailState === 'sent' && <p role="status" className="gp-muted" style={{ margin: '.5rem 0 0' }}>
          {tr(t, 'followEmailSent', 'Check your inbox and tap the confirmation link.')}{emailMsg ? ` (${emailMsg})` : ''}
        </p>}
        <p className="gp-muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
          {tr(t, 'followUrgent', 'If this is urgent or an emergency, contact your host directly or call local emergency services.')}
        </p>
      </div>
    </div>
  </div>;
}
