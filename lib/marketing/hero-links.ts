import type { StaticImageData } from 'next/image';

import { requireArticleCover } from '@/lib/marketing/article-covers';
import conciergeBell from '@/public/premium/concierge-bell-signup.webp';

/**
 * The seven hero frames, and the single source of truth for the public
 * marketing routes they point at.
 *
 * The fan used to be decorative. Now each frame is a real link, and this array
 * is consumed in three places:
 *
 *   1. components/landing/Hero.tsx — renders the arc.
 *   2. app/sitemap.ts — publishes the routes.
 *   3. components/landing/LandingFooter.tsx — text-link fallback, so the routes
 *      are reachable and crawlable independently of the hero's geometry.
 *
 * The six content pages reuse their registered article illustrations. That is
 * deliberate: the thumbnail a visitor clicks, the first article image they land
 * on, and the Related-card they see later all depict the page's same subject.
 * The centre frame is the one exception: the concierge bell represents the
 * conversion action and carries the brand mark.
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
  src: StaticImageData | string;
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
    src: requireArticleCover('/about').src,
    x: -46,
    y: 26,
    rot: -21,
    rank: 3,
    pos: '50% 50%',
  },
  {
    href: '/resources/guest-communication-guide',
    label: 'Host guide',
    description: 'The guest communication guide for short-term rental hosts',
    src: requireArticleCover('/resources/guest-communication-guide').src,
    x: -31,
    y: 11,
    rot: -14,
    rank: 2,
    pos: '50% 50%',
  },
  {
    href: '/how-it-works',
    label: 'How it works',
    description: 'What the Property Brain is and how a guest answer is produced',
    src: requireArticleCover('/how-it-works').src,
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
    // The bell remains the only metaphor in the set: the conversion action is
    // about someone being on the other end, not a specific article.
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
    src: requireArticleCover('/guest-experience').src,
    x: 16,
    y: 2,
    rot: 7,
    rank: 1,
    pos: '50% 50%',
  },
  {
    href: '/support',
    label: 'Support',
    description: 'Get help, report a problem, or reach a human',
    src: requireArticleCover('/support').src,
    x: 31,
    y: 11,
    rot: 14,
    rank: 2,
    pos: '50% 50%',
  },
  {
    href: '/security',
    label: 'Trust & safety',
    description: 'How your data and your guests\u2019 data are protected',
    src: requireArticleCover('/security').src,
    x: 46,
    y: 26,
    rot: 21,
    rank: 3,
    pos: '50% 50%',
  },
] as const;

/** Content routes only — used by the sitemap and the footer nav. */
export const MARKETING_ROUTES = HERO_LINKS.filter((l) => !l.noSitemap);
