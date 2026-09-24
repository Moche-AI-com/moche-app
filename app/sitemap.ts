import type { MetadataRoute } from 'next';
import { SITE_URL, IS_PRODUCTION_HOST } from '@/lib/seo';
import { LEGAL_DOCS } from '@/lib/legal/registry';
import { MARKETING_ROUTES } from '@/lib/marketing/hero-links';

// Only public indexable pages. No redirects, auth pages, or per-guest URLs.
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
    ...MARKETING_ROUTES.map((route) => ({
      url: `${SITE_URL}${route.href}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
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
