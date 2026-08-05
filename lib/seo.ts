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

export const DEFAULT_TITLE = 'Moche-AI — Run every property from one workspace';

export const DEFAULT_DESCRIPTION =
  'Answer guest questions instantly, keep every property detail in one place, and turn more stays into five-star reviews. Guest operations for short-term rental hosts.';
