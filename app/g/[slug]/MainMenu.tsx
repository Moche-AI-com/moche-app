'use client';

import { ConciergeBell, MessageCircle, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import type { PortalStep } from './GuestPortal';

type MenuKey = Extract<PortalStep, 'ask' | 'host' | 'maintenance' | 'extras'>;

const CARDS: { key: MenuKey; title: string; blurb: string; Icon: LucideIcon }[] = [
  {
    key: 'ask',
    title: 'Ask Questions',
    blurb: 'Instant AI answers about Wi-Fi, check-in, house rules, local tips and more.',
    Icon: MessageCircle,
  },
  {
    key: 'host',
    title: 'Message Host Directly',
    blurb: 'Reach your host or property staff — a real person, not the AI.',
    Icon: ConciergeBell,
  },
  {
    key: 'maintenance',
    title: 'Report Service Maintenance',
    blurb: 'Something not working? Troubleshoot with the AI, then file a report to the team.',
    Icon: Wrench,
  },
  {
    key: 'extras',
    title: 'Extras & Amenities',
    blurb: 'Browse and request add-ons, upgrades and experiences for your stay.',
    Icon: Sparkles,
  },
];

// Step 3 of the portal: exactly four workflow options, each opening its own
// distinct workflow.
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
        {CARDS.map(({ key, title, blurb, Icon }) => (
          <button
            key={key}
            type="button"
            className="gp-menu-card"
            onClick={() => props.onSelect(key)}
            disabled={props.hostPreview && key !== 'ask'}
            data-testid={`menu-${key}`}
          >
            <span className="gp-menu-icon"><Icon size={22} aria-hidden /></span>
            <span className="gp-menu-title">{title}</span>
            <span className="gp-menu-blurb">{blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
