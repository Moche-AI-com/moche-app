'use client';

import type { PortalStep } from './GuestPortal';
import type { PortalT } from '@/lib/guest/portal-strings';
import { CardArt } from './CardArt';
import { ReviewNudge } from './ReviewNudge';

type MenuKey = Extract<PortalStep, 'ask' | 'host' | 'maintenance' | 'extras'>;

export function MainMenu(props: { propertyName: string; guestName: string | null; hostPreview: boolean; t: PortalT; onSelect: (key: MenuKey) => void; onPreviewSignIn: () => void }) {
  const { t } = props;
  const cards: { key: MenuKey; title: string; blurb: string }[] = [
    { key: 'ask', title: t('cardAskTitle'), blurb: t('cardAskBlurb') },
    { key: 'host', title: t('cardHostTitle'), blurb: t('cardHostBlurb') },
    { key: 'maintenance', title: t('cardMaintTitle'), blurb: t('cardMaintBlurb') },
    { key: 'extras', title: t('cardExtrasTitle'), blurb: t('cardExtrasBlurb') },
  ];
  return <section aria-label="Main menu">
    <h1 className="gp-step-title">{props.guestName ? t('menuWelcomeName', { name: props.guestName }) : t('menuWelcome')}</h1>
    <p className="gp-step-sub">{t('menuSub', { property: props.propertyName })}</p>
    {props.hostPreview ? <div style={{ marginBottom: '1rem' }}><div className="gp-banner gp-banner-host" role="note">{t('menuHostPreview')}</div><button type="button" className="gp-msg-link" onClick={props.onPreviewSignIn} data-testid="button-preview-signin-flow">{t('menuPreviewSignIn')}</button></div> : null}
    <div className="gp-menu-grid">{cards.map(({ key, title, blurb }, index) => <button key={key} type="button" className="gp-menu-card" style={{ animationDelay: `${index * 70}ms` }} onClick={() => props.onSelect(key)} data-testid={`menu-${key}`}><CardArt cardKey={key} /><span className="gp-menu-title">{title}</span><span className="gp-menu-blurb">{blurb}</span></button>)}</div>
    {!props.hostPreview && <ReviewNudge propertyName={props.propertyName} onContactHost={() => props.onSelect('host')} />}
  </section>;
}
