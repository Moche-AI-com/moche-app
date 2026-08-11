/**
 * Canonical site origin, used for metadataBase, canonical URLs, robots.txt,
 * sitemap.xml, and Open Graph image URLs.
 *
 * Order matters. `lib/env.ts` exposes `appUrl`, but its fallback is
 * http://localhost:3000, which must never leak into a canonical tag or a
 * sitemap on a production build. So the production origin is the last resort
 * here rather than localhost, and NEXT_PUBLIC_* is included because metadata
 * for client-rendered routes is evaluated without server-only env access.
 *
 * VERCEL_URL is intentionally NOT used: it resolves to the per-deployment
 * hostname (moche-app-abc123.vercel.app), and emitting that as a canonical
 * would split ranking signals across every preview deployment.
 */
const RAW_SITE_URL =
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.moche-ai.com';

/** Origin with no trailing slash, e.g. `https://www.moche-ai.com`. */
export const SITE_URL = RAW_SITE_URL.replace(/\/+$/, '');

export const SITE_NAME = 'Moche-AI';

/**
 * Only the real production host is allowed to be indexed. Preview deployments
 * and local runs return `false`, which keeps `robots.txt` at a blanket
 * disallow there — otherwise a preview URL can outrank the real site for its
 * own copy.
 */
export const IS_PRODUCTION_HOST = SITE_URL === 'https://www.moche-ai.com';

// Updated with the homepage positioning shift. The previous title and
// description promised a workspace and "instant" answers; the page now leads
// with property-aware guest support built from host-approved information, and
// metadata that describes the old page is metadata that misrepresents the new
// one in search and social previews.
export const DEFAULT_TITLE = 'Moche-AI — Property-aware guest support for short-term rentals';

export const DEFAULT_DESCRIPTION =
  'Moche helps guests find answers from the property information you approve, then routes questions to you when an answer is missing, restricted, or unclear. Guest support for short-term rental hosts.';
