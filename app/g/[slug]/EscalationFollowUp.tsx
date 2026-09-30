'use client';

import { useEffect, useState } from 'react';
import { BellRing, MessageSquareText, Smartphone } from 'lucide-react';
import type { PortalT } from '@/lib/guest/portal-strings';
import { PushOptIn } from './PushOptIn';

// Shown right after a question is escalated to the host. The host has ALREADY
// been notified (escalation never waits on guest contact details); this card
// only asks how the guest wants to hear back. Channel order mirrors
// notifyGuestConversationReply(): device push first, verified SMS second, and
// the answer always lands in the portal thread regardless.
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
  useEffect(() => { setPlatform(detectPlatform()); }, []);

  return <div className="gp-notice" role="region" aria-label={tr(t, 'followAria', 'Get notified when your host answers')} style={{ display: 'block' }} data-testid="escalation-follow-up">
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
      <BellRing size={17} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <strong>{tr(t, 'followTitle', 'Your host has been notified.')}</strong>
        <p className="gp-muted" style={{ margin: '.25rem 0 .5rem' }}>
          {tr(t, 'followSub', 'Want a heads-up when they answer? Their reply will also appear here and in Host chat.')}
        </p>
        {platform === 'push' && <PushOptIn slug={props.slug} t={t} />}
        {platform === 'ios_install' && <p className="gp-muted" style={{ margin: '.25rem 0 .5rem', display: 'flex', gap: '.35rem', alignItems: 'center' }}>
          <Smartphone size={15} aria-hidden />
          {tr(t, 'followIosHint', 'On iPhone: tap Share, then "Add to Home Screen" to get alerts on this device.')}
        </p>}
        <button type="button" className="gp-msg-link" onClick={props.onOpenHostChat} data-testid="button-follow-sms" style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'center' }}>
          <MessageSquareText size={15} aria-hidden /> {tr(t, 'followSms', 'Get a text instead')}
        </button>
        <p className="gp-muted" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>
          {tr(t, 'followUrgent', 'If this is urgent or an emergency, contact your host directly or call local emergency services.')}
        </p>
      </div>
    </div>
  </div>;
}
