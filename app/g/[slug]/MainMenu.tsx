'use client';

import type { PortalStep } from './GuestPortal';
import type { PortalT } from '@/lib/guest/portal-strings';
import { CardArt } from './CardArt';

type MenuKey = Extract<PortalStep, 'ask' | 'host' | 'maintenance' | 'extras'>;

// Step 3 of the portal: exactly four workflow options, each opening its own
// distinct workflow. Every card carries the same brand-gradient art tile with
// its own line glyph, staggers in on entry, and renders in the guest's chosen
// language via the portal dictionary.
export function MainMenu(props: {
  propertyName: string;
  guestName: string | null;
  hostPreview: boolean;
  t: PortalT;
  onSelect: (key: MenuKey) => void;
}) {
  const { t } = props;
  const CARDS: { key: MenuKey; title: string; blurb: string }[] = [
    { key: 'ask', title: t('cardAskTitle'), blurb: t('cardAskBlurb') },
    { key: 'host', title: t('cardHostTitle'), blurb: t('cardHostBlurb') },
    { key: 'maintenance', title: t('cardMaintTitle'), blurb: t('cardMaintBlurb') },
    { key: 'extras', title: t('cardExtrasTitle'), blurb: t('cardExtrasBlurb') },
  ];

  return (
    <section aria-label="Main menu">
      <h1 className="gp-step-title">
        {props.guestName ? t('menuWelcomeName', { name: props.guestName }) : t('menuWelcome')}
      </h1>
      <p className="gp-step-sub">{t('menuSub', { property: props.propertyName })}</p>

      {props.hostPreview ? (
        <div className="gp-banner gp-banner-host" role="note">
          {t('menuHostPreview')}
        </div>
      ) : null}

      <div className="gp-menu-grid">
        {CARDS.map(({ key, title, blurb }, index) => (
          <button
            key={key}
            type="button"
            className="gp-menu-card"
            style={{ animationDelay: `${index * 70}ms` }}
            onClick={() => props.onSelect(key)}
            disabled={props.hostPreview && key !== 'ask'}
            data-testid={`menu-${key}`}
          >
            <CardArt cardKey={key} />
            <span className="gp-menu-title">{title}</span>
            <span className="gp-menu-blurb">{blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
