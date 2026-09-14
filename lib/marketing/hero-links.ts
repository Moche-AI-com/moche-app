import type { StaticImageData } from 'next/image';

import beachhouse from '@/public/premium/str-hero-beachhouse.webp';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import kitchen from '@/public/premium/str-video-poster-kitchen.webp';
import pool from '@/public/premium/str-gallery-pool-deck.webp';
import handoff from '@/public/premium/str-gallery-key-handoff.webp';
import conciergeBell from '@/public/premium/concierge-bell-signup.webp';

/**
 * The seven hero frames, and the single source of truth for the public
 * marketing routes they point at.
 *
 * This is the brand gallery, deliberately separate from the topic-specific
 * article opener. The arc's job is to make a polished rental promise at first
 * sight; the article cover's job is to explain the destination's subject once
 * the visitor enters it. Use property photography here and registered article
 * art there. A reader therefore gets a client-facing landing surface without
 * losing topical context after the click.
 *
 * This array is consumed in three places:
 *
 *   1. components/landing/Hero.tsx — renders the arc.
 *   2. app/sitemap.ts — publishes the routes.
 *   3. components/landing/LandingFooter.tsx — text-link fallback, so the routes
 *      are reachable independently of the hero's geometry.
 *
 * `label` is the visible chip on the frame AND the link's accessible name, so
 * every image carries `alt=""` — the label is the text, and a screen reader
 * announcing both would read each destination twice. Geometry is data, not
 * markup: the CSS reads each frame's own offset, lift and rotation.
 */
export interface HeroLink {
  href: string;
  label: string;
  /** Announced to assistive tech and shown as the frame's tooltip. */
  description: string;
  src: StaticImageData;
  x: number;
  y: number;
  rot: number;
  rank: 0 | 1 | 2 | 3;
  pos: string;
  /** The centre frame is the primary conversion action, not a content page. */
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
    x: -46,
    y: 26,
    rot: -21,
    rank: 3,
    pos: '50% 86%',
  },
  {
    href: '/resources/guest-communication-guide',
    label: 'Host guide',
    description: 'The guest communication guide for short-term rental hosts',
    src: pool,
    x: -31,
    y: 11,
    rot: -14,
    rank: 2,
    pos: '50% 62%',
  },
  {
    href: '/how-it-works',
    label: 'How it works',
    description: 'What the Property Brain is and how a guest answer is produced',
    src: cabin,
    x: -16,
    y: 2,
    rot: -7,
    rank: 1,
    pos: '50% 50%',
  },
  {
    href: '/signup',
    label: 'Start free',
    description: 'Create your free account and publish today. One property included, no card required',
    // The concierge bell is the one metaphor in the set: it says someone is on
    // the other end and carries the brand mark.
    src: conciergeBell,
    x: 0,
    y: -3,
    rot: 0,
    rank: 0,
    pos: '50% 50%',
    cta: true,
    noSitemap: true,
  },
  {
    href: '/guest-experience',
    label: 'Guest view',
    description: 'What your guests actually see during a stay',
    src: cottage,
    x: 16,
    y: 2,
    rot: 7,
    rank: 1,
    pos: '50% 55%',
  },
  {
    href: '/support',
    label: 'Support',
    description: 'Get help, report a problem, or reach a human',
    src: kitchen,
    x: 31,
    y: 11,
    rot: 14,
    rank: 2,
    pos: '50% 55%',
  },
  {
    href: '/security',
    label: 'Trust & safety',
    description: 'How your data and your guests\u2019 data are protected',
    src: handoff,
    x: 46,
    y: 26,
    rot: 21,
    rank: 3,
    pos: '50% 50%',
  },
] as const;

/** Content routes only — used by the sitemap and the footer nav. */
export const MARKETING_ROUTES = HERO_LINKS.filter((l) => !l.noSitemap);
