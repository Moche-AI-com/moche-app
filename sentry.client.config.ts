// Sentry browser SDK init. No-ops cleanly when NEXT_PUBLIC_SENTRY_DSN is unset.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // PII scrubbing: never attach request bodies or default PII.
    sendDefaultPii: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
