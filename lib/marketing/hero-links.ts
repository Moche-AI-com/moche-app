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
 * The fan used to be decorative: seven `aria-hidden` photographs with a hover
 * lift and no destination. That spent the most valuable real estate on the site
 * on nothing, and it gave crawlers no path off the homepage — every public URL
 * except /legal was orphaned from the landing page.
 *
 * Now each frame is a real link, and this array is consumed in three places:
 *
 *   1. components/landing/Hero.tsx — renders the arc.
 *   2. app/sitemap.ts — publishes the routes.
 *   3. components/landing/LandingFooter.tsx — text-link fallback, so the routes
 *      are reachable and crawlable independently of the hero's geometry.
 *
 * Adding a page means adding a row here plus the route file. Nothing else.
 *
 * `label` is the visible chip on the frame AND the link's accessible name, so
 * every image carries `alt=""` — the label is the text, and a screen reader
 * announcing both would read each destination twice. Labels are two or three
 * words on purpose: they have to fit one line inside a 74px-wide frame at the
 * narrowest desktop size without wrapping.
 *
 * Geometry is data, not markup. Each frame carries its own offset, lift and
 * rotation and the CSS reads them.
 *
 * `rank` is the distance from centre (0 = centre, 3 = outermost). It drives
 * z-order and the desktop arc's proportions. It no longer hides anything: the
 * old implementation dropped rank 3 under 700px and rank 2 under 430px, which
 * on a phone silently removed four of the seven destinations from the page.
 * Under 700px the arc becomes a grid instead, so all seven stay reachable.
 *
 * `pos` is the crop anchor. These frames are tall windows onto photographs that
 * were not shot for that ratio, and a centred crop of the beach house is two
 * thirds empty sky.
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
    description: 'Create your account and start building. Free until launch, no card',
    // The concierge bell is the one image in the set that is a metaphor rather
    // than a place: it says "someone is on the other end of this", which is the
    // whole promise, and it carries the brand mark inside the photograph. It is
    // the centre frame, so it is what the eye lands on before the headline.
    src: conciergeBell,
    x: 0,
    y: -3,
    rot: 0,
    rank: 0,
    // Centred rather than 50% 45%: the source is already 3:4, so desktop frames
    // show it whole, and the mobile CTA band (16 / 7) crops to a horizontal strip
    // that keeps both the bell and the badge in view at 50%.
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
