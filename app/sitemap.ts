import type { MetadataRoute } from 'next';
import { SITE_URL, IS_PRODUCTION_HOST } from '@/lib/seo';
import { LEGAL_DOCS } from '@/lib/legal/registry';

// /sitemap.xml
//
// Only public, indexable documents are listed: the landing page, the legal
// index, and each legal document. Auth-gated routes (/dashboard/*) and
// per-guest routes (/stay/*, /g/*, /answer/*) are deliberately absent —
// listing a guest portal URL here would publish a real stay.
//
// Legal `lastModified` comes from LEGAL_DOCS.lastUpdated, so republishing a
// document with a bumped date is reflected here automatically instead of
// drifting out of sync with a hand-maintained list.
//
// On non-production origins this returns an empty sitemap to match robots.ts,
// which disallows everything there.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!IS_PRODUCTION_HOST) return [];

  const legalIndexLastModified = LEGAL_DOCS.map((d) => d.lastUpdated)
    .sort()
    .at(-1);

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/legal`,
      lastModified: legalIndexLastModified ? new Date(legalIndexLastModified) : new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    ...LEGAL_DOCS.map((doc) => ({
      url: `${SITE_URL}/legal/${doc.slug}`,
      lastModified: new Date(doc.lastUpdated),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ];
}
