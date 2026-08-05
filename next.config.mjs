import { withSentryConfig } from '@sentry/nextjs';

// Content Security Policy.
//
// Shipped in REPORT-ONLY mode first: violations are reported to /api/csp-report and
// logged, but nothing is blocked. This lets us discover every legitimate source in
// production without risking a blank page for a guest mid-stay. Promote to the
// enforcing `Content-Security-Policy` header only after the report stream is quiet.
//
// Sources, and why each is here:
//   'unsafe-inline' / 'unsafe-eval' in script-src  — required by the Next.js App Router
//     bootstrap and React refresh. Removing these needs nonce-based CSP; tracked separately.
//   challenges.cloudflare.com  — Turnstile bot check on guest verification.
//   us.i.posthog.com / us-assets.i.posthog.com  — product analytics.
//   *.supabase.co (https + wss)  — database, auth, and realtime.
//   fonts.googleapis.com / fonts.gstatic.com / api.fontshare.com  — webfonts.
//   Sentry is NOT listed: browser events are tunnelled through the same-origin
//     /monitoring rewrite configured below, so it needs no external origin.
//   img-src allows https: because hosts may paste an external property image URL.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://us-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
  "font-src 'self' data: https://fonts.gstatic.com https://api.fontshare.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://challenges.cloudflare.com",
  'report-uri /api/csp-report',
].join('; ');

// `upgrade-insecure-requests` is deliberately NOT in CSP_DIRECTIVES above.
// Browsers ignore it when it arrives in a report-only policy and log
// "The Content Security Policy directive 'upgrade-insecure-requests' is ignored
// when delivered in a report-only policy" as a console error on every page load
// -- noise that buries real errors during launch.
//
// So it ships as its own ENFORCING header instead. A policy containing only this
// directive has no fetch directives, so it blocks nothing; it just upgrades any
// stray http:// subresource to https://. The security benefit is kept and the
// console stays clean, and it is independent of promoting CSP_DIRECTIVES out of
// report-only later.
const CSP_ENFORCED_DIRECTIVES = 'upgrade-insecure-requests';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // Baseline security headers applied to all routes.
    // Per-route Cache-Control (private, no-store) for guest/dashboard data is set in handlers.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Force HTTPS for a year incl. subdomains (Vercel serves valid certs).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy-Report-Only', value: CSP_DIRECTIVES },
          { key: 'Content-Security-Policy', value: CSP_ENFORCED_DIRECTIVES },
          // Vercel serves files from public/ with `access-control-allow-origin: *`,
          // which let any origin read our pages cross-origin. Nothing here is a public
          // API, so pin the header to same-origin and override that default.
          { key: 'Access-Control-Allow-Origin', value: 'https://www.moche-ai.com' },
          { key: 'Vary', value: 'Origin' },
          // Keep the browser from treating any response as a cross-origin resource.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

// Source maps are uploaded to Sentry only when an auth token is present (CI/deploy).
// Without it, the build proceeds normally and no upload is attempted.
const sentryBuildOptions = {
  silent: true,
  // Only enable the upload plugin when credentials exist; otherwise it stays inert.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
  // Route browser Sentry requests through a Next rewrite to dodge ad-blockers.
  tunnelRoute: '/monitoring',
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
