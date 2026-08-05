import type { MetadataRoute } from 'next';
import { SITE_URL, IS_PRODUCTION_HOST } from '@/lib/seo';

// /robots.txt
//
// Before this file existed the path fell through to the app's catch-all and
// returned the styled 404 page with a 200-ish HTML body, which crawlers read as
// "no rules" while also wasting a fetch on markup.
//
// Only the marketing surface (/ and /legal/*) is crawlable. Everything else is
// either behind auth or is a per-guest URL that must never appear in an index:
//   /dashboard  — host workspace, auth-gated
//   /stay, /g   — guest portals keyed to a specific stay; indexing one would
//                 publish a real guest's arrival details
//   /answer     — single-use host reply links
//   /api, /monitoring — non-document endpoints (Sentry tunnel included)
//   /login, /signup, /reset, /verify-email — thin auth pages with no search value
//
// Non-production origins (previews, local) get a blanket disallow so a preview
// deployment can never compete with www for the same copy.
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION_HOST) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/stay/',
          '/g/',
          '/answer/',
          '/api/',
          '/monitoring',
          '/login',
          '/signup',
          '/reset',
          '/verify-email',
          '/landing.html',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
