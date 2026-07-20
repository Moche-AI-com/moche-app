'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: '#070C14', color: '#E8EDF5', fontFamily: 'system-ui, sans-serif', minHeight: '100dvh', display: 'grid', placeItems: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 420, padding: '2rem' }}>
          <h1 style={{ fontSize: '1.6rem', marginBottom: '.35rem' }}>Something went wrong</h1>
          <p style={{ color: '#8A97AB', marginBottom: '1.5rem' }}>
            The application hit an unexpected error{error.digest ? ` (ref: ${error.digest})` : ''}.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ background: '#33E6D4', color: '#04121A', border: 'none', padding: '.65rem 1.25rem', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
