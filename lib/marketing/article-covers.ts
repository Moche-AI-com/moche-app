import type { StaticImageData } from 'next/image';

/**
 * Presentation registry for each public marketing article.
 *
 * The first image needs to explain the page's subject, while the H1 supplies
 * the same subject in indexable text. Keeping both in this registry keeps an
 * article from opening with trustworthy copy under an unrelated decorative
 * image — or with a clean rental photograph whose subject says nothing about
 * the page. The homepage arc can deliberately use separate property
 * photography: it is a brand gallery, while this registry is article-focused.
 *
 * `src` is a static public-path SVG: reviewable, tiny, and safe to serve
 * through Next/Image with `unoptimized` enabled. Current page call sites still
 * pass the product capture that briefly opened each article, so PageHero uses
 * the compatibility marker below. New pages should register `{ href, eyebrow,
 * src, h1 }` together instead of adding another marker.
 */
export interface ArticleCover {
  href: string;
  eyebrow: string;
  src: `/premium/article-covers/${string}.svg`;
  alt: string;
  caption: string;
  /** The visible, indexable H1. Keep it unique, natural, and under 60 chars. */
  h1: string;
}

interface RegisteredArticleCover extends ArticleCover {
  /** Stable filename fragment in the imported product capture handed to PageHero. */
  legacyProductMarker: string;
}

const ARTICLE_COVERS: readonly RegisteredArticleCover[] = [
  {
    href: '/about',
    eyebrow: 'Our story',
    legacyProductMarker: 'product-landing-desktop',
    src: '/premium/article-covers/about-property-story.svg',
    alt: 'Editorial illustration of a coastal holiday home beside an open host guide',
    caption:
      'Started from the work of hosting: the handwritten detail, the shared property, and the knowledge worth keeping.',
    h1: 'Why we built Moche-AI for short-term rental hosts',
  },
  {
    href: '/resources/guest-communication-guide',
    eyebrow: 'Host guide',
    legacyProductMarker: 'product-local-recs-desktop',
    src: '/premium/article-covers/host-guide-communication.svg',
    alt: 'Editorial illustration of an open guest guide with communication waves above a rental desk',
    caption:
      'A guest guide is most useful when the answer is reachable before another message is sent.',
    h1: 'Guest communication guide for short-term rental hosts',
  },
  {
    href: '/how-it-works',
    eyebrow: 'How it works',
    legacyProductMarker: 'product-go-live-desktop',
    src: '/premium/article-covers/how-it-works-flow.svg',
    alt: 'Editorial illustration of property details flowing through a house and into a checked answer',
    caption:
      'Property details flow through one checked path: source, answer, and escalation when the source is not there.',
    h1: 'How Moche-AI answers short-term rental guest questions',
  },
  {
    href: '/guest-experience',
    eyebrow: 'Guest view',
    legacyProductMarker: 'product-portal-desktop',
    src: '/premium/article-covers/guest-experience-phone.svg',
    alt: 'Editorial illustration of a guest holding a phone with a checked answer inside a holiday rental',
    caption:
      'One stay link, property-specific answers, and no account between the guest and the detail they need.',
    h1: 'What guests see in the Moche-AI guest portal',
  },
  {
    href: '/support',
    eyebrow: 'Support',
    legacyProductMarker: 'product-guest-experience-desktop',
    src: '/premium/article-covers/support-concierge.svg',
    alt: 'Editorial illustration of a concierge bell and headset details beside a prepared rental kitchen',
    caption:
      'When the answer is not already known, a person can step in with the context already attached.',
    h1: 'Moche-AI support for short-term rental hosts',
  },
  {
    href: '/security',
    eyebrow: 'Trust & safety',
    legacyProductMarker: 'product-how-it-works-desktop',
    src: '/premium/article-covers/trust-safety-lock.svg',
    alt: 'Editorial illustration of a secured holiday-rental door with a shield and key',
    caption:
      'The front door is the model: access belongs to the right guest, for the right stay, and nowhere else.',
    h1: 'Data security and privacy for hosts and guests',
  },
] as const;

export function articleCoverForHref(href: string): ArticleCover | null {
  return ARTICLE_COVERS.find((cover) => cover.href === href) ?? null;
}

/** Resolve the registered SEO H1 for a DocHeader eyebrow; unknown pages keep theirs. */
export function articleH1ForEyebrow(eyebrow: string): string | null {
  return ARTICLE_COVERS.find((cover) => cover.eyebrow === eyebrow)?.h1 ?? null;
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
