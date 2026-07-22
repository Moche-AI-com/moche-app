import { withSentryConfig } from '@sentry/nextjs';

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
