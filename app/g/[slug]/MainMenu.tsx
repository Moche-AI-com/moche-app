'use client';

import type { PortalStep } from './GuestPortal';
import { CardArt } from './CardArt';

type MenuKey = Extract<PortalStep, 'ask' | 'host' | 'maintenance' | 'extras'>;

const CARDS: { key: MenuKey; title: string; blurb: string }[] = [
  {
    key: 'ask',
    title: 'Ask Questions',
    blurb: 'Instant AI answers about Wi-Fi, check-in, house rules, local tips and more.',
  },
  {
    key: 'host',
    title: 'Message Host Directly',
    blurb: 'Reach your host or property staff — a real person, not the AI.',
  },
  {
    key: 'maintenance',
    title: 'Report Service Maintenance',
    blurb: 'Something not working? Troubleshoot with the AI, then file a report to the team.',
  },
  {
    key: 'extras',
    title: 'Extras & Amenities',
    blurb: 'Browse and request add-ons, upgrades and experiences for your stay.',
  },
];

// Step 3 of the portal: exactly four workflow options, each opening its own
// distinct workflow. Every card carries the same brand-gradient art tile with
// its own line glyph — consistent frame, no stock-photo clutter.
export function MainMenu(props: {
  propertyName: string;
  guestName: string | null;
  hostPreview: boolean;
  onSelect: (key: MenuKey) => void;
}) {
  return (
    <section aria-label="Main menu">
      <h1 className="gp-step-title">
        {props.guestName ? `Welcome, ${props.guestName}` : 'Welcome'}
      </h1>
      <p className="gp-step-sub">How can we help you at {props.propertyName}?</p>

      {props.hostPreview ? (
        <div className="gp-banner gp-banner-host" role="note">
          Host preview — you&apos;re seeing the portal as a guest would. Only Ask Questions is live in preview.
        </div>
      ) : null}

      <div className="gp-menu-grid">
        {CARDS.map(({ key, title, blurb }) => (
          <button
            key={key}
            type="button"
            className="gp-menu-card"
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
