import type { StaticImageData } from 'next/image';

import beachhouse from '@/public/premium/str-hero-beachhouse.webp';
import cottage from '@/public/premium/str-gallery-cliffside-cottage.webp';
import cabin from '@/public/premium/str-gallery-cozy-cabin.webp';
import kitchen from '@/public/premium/str-video-poster-kitchen.webp';
import pool from '@/public/premium/str-gallery-pool-deck.webp';
import handoff from '@/public/premium/str-gallery-key-handoff.webp';

/**
 * Editorial photograph at the opening of each public article.
 *
 * Product captures belong in ArticleFigure, inside the paragraph that is
 * actually describing the surface. The page opener, the homepage arc card, and
 * the Related-card thumbnail all need to be the same *place*: a visitor who
 * clicked a cottage should arrive at an article that opens with that cottage,
 * not with a dashboard screenshot. That continuity is part of what makes the
 * cluster read as client-facing marketing rather than a stack of UI captures.
 *
 * The current page call sites still pass the product capture that briefly
 * opened each article, so the registry is keyed by that capture's path marker.
 * That keeps this correction small and leaves every inline ArticleFigure
 * untouched; it is a compatibility bridge, not an invitation to add another
 * selector by image filename when the call sites are next normalized.
 */
export interface ArticleCover {
  src: StaticImageData;
  alt: string;
  caption: string;
}

interface RegisteredArticleCover extends ArticleCover {
  /** Stable filename fragment in the imported product capture handed to PageHero. */
  legacyProductMarker: string;
}

const ARTICLE_COVERS: readonly RegisteredArticleCover[] = [
  {
    legacyProductMarker: 'product-landing-desktop',
    src: beachhouse,
    alt: 'A modern beach house with palm trees and the ocean visible in the distance',
    caption:
      'A coastal rental at arrival time — the kind of property whose details too often live in a text message from two summers ago.',
  },
  {
    legacyProductMarker: 'product-local-recs-desktop',
    src: pool,
    alt: 'A backyard swimming pool and wooden deck at a vacation rental under a clear blue sky',
    caption:
      'The place the guide is preparing guests to enjoy — while the operational answers are reachable before they have to ask.',
  },
  {
    legacyProductMarker: 'product-go-live-desktop',
    src: cabin,
    alt: 'A cozy short-term rental cabin interior with natural light and warm wood finishes',
    caption:
      'A finished stay ready to open its door — the visible result once the property knowledge behind it is organized.',
  },
  {
    legacyProductMarker: 'product-portal-desktop',
    src: cottage,
    alt: 'A coastal cottage with white cliffs in the background, photographed as a vacation rental',
    caption:
      'The stay your guest is standing inside. The portal is the quiet layer that answers from the details of this property.',
  },
  {
    legacyProductMarker: 'product-guest-experience-desktop',
    src: kitchen,
    alt: 'A bright modern vacation rental kitchen and dining area, clean and ready for guests',
    caption:
      'A prepared rental is a set of small decisions made in advance. Support exists for the moments one is still missing.',
  },
  {
    legacyProductMarker: 'product-how-it-works-desktop',
    src: handoff,
    alt: 'A key being handed over at a vacation rental check-in, with only the hands visible',
    caption:
      'Trust shows up at contact points: a clear handoff, scoped guest access, and no broad claim the record cannot support.',
  },
] as const;

/**
 * Resolve the editorial cover for the capture currently passed by a page.
 * Returns null for any other StaticImageData so unrelated marketing images
 * cannot be silently replaced.
 */
export function articleCoverFor(legacySource: StaticImageData): ArticleCover | null {
  const filename = legacySource.src.split('/').findLast(Boolean) ?? legacySource.src;

  return (
    ARTICLE_COVERS.find((cover) => filename.includes(cover.legacyProductMarker)) ?? null
  );
}
