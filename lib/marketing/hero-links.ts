import type { StaticImageData } from 'next/image';

import beachhouse from '@/public/premium/str-hero-beachhouse.webp';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import kitchen from '@/public/premium/str-video-poster-kitchen.webp';
import pool from '@/public/premium/str-gallery-pool-deck.webp';
import handoff from '@/public/premium/str-gallery-key-handoff.webp';
import conciergeBell from '@/public/premium/concierge-bell-signup.webp';

/**
 * The hero showcase destinations, and the single source of truth for the
 * public marketing routes they point at.
 *
 * The fan used to be decorative: seven `aria-hidden` photographs with a hover
 * lift and no destination. That spent the most valuable real estate on the
 * site on nothing, and it gave crawlers no path off the homepage — every
 * public URL except /legal was orphaned from the landing page.
 *
 * Now each card is a real link, and this array is consumed in four places:
 *
 * 1. components/landing/Hero.tsx — renders SHOWCASE_LINKS (every destination
 *    except the signup entry) as the document grid.
 * 2. app/sitemap.ts — publishes the routes.
 * 3. components/landing/LandingFooter.tsx — text-link fallback, so the routes
 *    are reachable and crawlable independently of the hero's geometry.
 * 4. app/(marketing)/_parts.tsx — the Related cross-link cards each page ends
 *    with, so the six pages are a linked cluster rather than six dead ends.
 *
 * Adding a page means adding a row here plus the route file. Nothing else.
 *
 * `label` is the visible chip on the card AND the link's accessible name, so
 * every image carries `alt=""` — the label is the text, and a screen reader
 * announcing both would read each destination twice. Labels are two or three
 * words on purpose: they have to fit one line inside the card at the
 * narrowest width without wrapping.
 *
 * `pos` is the crop anchor. These cards are windows onto photographs that
 * were not shot for the card ratio, and a centred crop of the beach house is
 * two thirds empty sky.
 */
export interface HeroLink {
  href: string;
  label: string;
  /** Shown as the card's tooltip for pointer users. */
  description: string;
  src: StaticImageData;
  pos: string;
  /** The signup entry is the primary conversion action, not a content page. */
  cta?: true;
  /** Excluded from the sitemap (already listed, or not a content page). */
  noSitemap?: true;
}

export const HERO_LINKS: readonly HeroLink[] = [
  {
    href: '/about',
    label: 'Our story',
    description: 'Why we built Moche-AI, and who is behind it',
    src: beachhouse,
    pos: '50% 86%',
  },
  {
    href: '/resources/guest-communication-guide',
    label: 'Host guide',
    description: 'The guest communication guide for short-term rental hosts',
    src: pool,
    pos: '50% 62%',
  },
  {
    href: '/how-it-works',
    label: 'How it works',
    description: 'What the Property Brain is and how a guest answer is produced',
    src: cabin,
    pos: '50% 50%',
  },
  {
    href: '/guest-experience',
    label: 'Guest view',
    description: 'What your guests actually see during a stay',
    src: cottage,
    pos: '50% 55%',
  },
  {
    href: '/support',
    label: 'Support',
    description: 'Get help, report a problem, or reach a human',
    src: kitchen,
    pos: '50% 55%',
  },
  {
    href: '/security',
    label: 'Trust & safety',
    description: 'How your data and your guests\u2019 data are protected',
    src: handoff,
    pos: '50% 50%',
  },
  {
    href: '/signup',
    label: 'Start free',
    description: 'Create your free account and publish today. One property included, no card required',
    // The concierge bell is the one image in the set that is a metaphor rather
    // than a place: it says "someone is on the other end of this", which is the
    // whole promise, and it carries the brand mark inside the photograph.
    src: conciergeBell,
    pos: '50% 50%',
    cta: true,
    noSitemap: true,
  },
] as const;

/** The six content destinations rendered by the landing hero. The signup entry
    is excluded — signup has its own buttons beneath the headline. */
export const SHOWCASE_LINKS = HERO_LINKS.filter((l) => !l.cta);

/** Content routes only — used by the sitemap, the footer nav, and Related. */
export const MARKETING_ROUTES = HERO_LINKS.filter((l) => !l.noSitemap);
