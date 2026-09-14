import type { StaticImageData } from 'next/image';

/**
 * Editorial cover for each public marketing article.
 *
 * The first image on an article has to earn its place twice: it represents the
 * page in the homepage arc and Related cards, and then it opens the article
 * itself. Generic rental photography can do the first job while saying almost
 * nothing about the second. These six generated illustrations use the brand
 * palette and property-setting details to make the page's actual subject
 * visible before the reader reaches the first paragraph.
 *
 * `src` is a static public-path SVG rather than a generated raster. The assets
 * are text, reviewable, tiny, and cannot recreate an inappropriate face or
 * publish artifact; Next/Image serves them unoptimized by design.
 *
 * Current page call sites still pass the product capture that briefly opened
 * each article, so PageHero resolves the cover through `legacyProductMarker`.
 * New marketing pages should call `requireArticleCover(href)` directly rather
 * than adding another compatibility marker.
 */
export interface ArticleCover {
  href: string;
  src: `/premium/article-covers/${string}.svg`;
  alt: string;
  caption: string;
}

interface RegisteredArticleCover extends ArticleCover {
  /** Stable filename fragment in the imported product capture handed to PageHero. */
  legacyProductMarker: string;
}

const ARTICLE_COVERS: readonly RegisteredArticleCover[] = [
  {
    href: '/about',
    legacyProductMarker: 'product-landing-desktop',
    src: '/premium/article-covers/about-property-story.svg',
    alt: 'Editorial illustration of a coastal holiday home beside an open host guide',
    caption:
      'Started from the work of hosting: the handwritten detail, the shared property, and the knowledge worth keeping.',
  },
  {
    href: '/resources/guest-communication-guide',
    legacyProductMarker: 'product-local-recs-desktop',
    src: '/premium/article-covers/host-guide-communication.svg',
    alt: 'Editorial illustration of an open guest guide with communication waves above a rental desk',
    caption:
      'A guest guide is most useful when the answer is reachable before another message is sent.',
  },
  {
    href: '/how-it-works',
    legacyProductMarker: 'product-go-live-desktop',
    src: '/premium/article-covers/how-it-works-flow.svg',
    alt: 'Editorial illustration of property details flowing through a house and into a checked answer',
    caption:
      'Property details flow through one checked path: source, answer, and escalation when the source is not there.',
  },
  {
    href: '/guest-experience',
    legacyProductMarker: 'product-portal-desktop',
    src: '/premium/article-covers/guest-experience-phone.svg',
    alt: 'Editorial illustration of a guest holding a phone with a checked answer inside a holiday rental',
    caption:
      'One stay link, property-specific answers, and no account between the guest and the detail they need.',
  },
  {
    href: '/support',
    legacyProductMarker: 'product-guest-experience-desktop',
    src: '/premium/article-covers/support-concierge.svg',
    alt: 'Editorial illustration of a concierge bell and headset details beside a prepared rental kitchen',
    caption:
      'When the answer is not already known, a person can step in with the context already attached.',
  },
  {
    href: '/security',
    legacyProductMarker: 'product-how-it-works-desktop',
    src: '/premium/article-covers/trust-safety-lock.svg',
    alt: 'Editorial illustration of a secured holiday-rental door with a shield and key',
    caption:
      'The front door is the model: access belongs to the right guest, for the right stay, and nowhere else.',
  },
] as const;

export function articleCoverForHref(href: string): ArticleCover | null {
  return ARTICLE_COVERS.find((cover) => cover.href === href) ?? null;
}

/** Fail at module initialization rather than letting a page fall out of the set. */
export function requireArticleCover(href: string): ArticleCover {
  const cover = articleCoverForHref(href);
  if (!cover) throw new Error(`No marketing article cover is registered for ${href}`);
  return cover;
}

/**
 * Resolve the editorial cover for the product capture currently passed by a
 * page. Returns null for any other image so unrelated marketing surfaces are
 * never silently replaced.
 */
export function articleCoverFor(legacySource: StaticImageData): ArticleCover | null {
  const filename = legacySource.src.split('/').findLast(Boolean) ?? legacySource.src;
  return (
    ARTICLE_COVERS.find((cover) => filename.includes(cover.legacyProductMarker)) ?? null
  );
}
