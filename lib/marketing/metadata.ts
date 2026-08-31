import type { Metadata } from 'next';
import { SITE_URL, SITE_NAME } from '@/lib/seo';

/**
 * Metadata builder for the public marketing routes.
 *
 * The important line is `robots`. The root layout defaults every route to
 * `noindex, nofollow` so that /dashboard and the per-guest /stay, /g and
 * /answer URLs can never be indexed. Content pages inherit that default and
 * would ship un-indexable — which is the exact opposite of why they exist — so
 * each one has to opt back in explicitly, the same way app/page.tsx does.
 *
 * `openGraph.siteName` and `locale` are repeated on purpose: Next replaces the
 * `openGraph` object wholesale rather than deep-merging it, so omitting them
 * here drops og:site_name and og:locale from the pages most likely to be shared.
 *
 * Title is passed WITHOUT the brand suffix; this adds it, so the 50-60 character
 * budget is enforced in one place instead of six.
 */
export function marketingMetadata({
  title,
  description,
  path,
}: {
  /** Under ~45 characters. The " — Moche-AI" suffix is appended here. */
  title: string;
  /** 150-160 characters. Written as a search result, not as a summary. */
  description: string;
  /** Route path with a leading slash, e.g. `/about`. */
  path: string;
}): Metadata {
  const fullTitle = `${title} — ${SITE_NAME}`;
  const url = `${SITE_URL}${path}`;

  return {
    title: fullTitle,
    description,
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: SITE_NAME,
      locale: 'en_US',
      url,
      title: fullTitle,
      description,
    },
  };
}
