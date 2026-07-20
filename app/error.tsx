'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log the digest only — never the full error/PII — to the server console.
    // eslint-disable-next-line no-console
    console.error('Client error boundary:', error.digest ?? 'no-digest');
  }, [error]);

  return (
    <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1 style={{ fontSize: '1.6rem', marginBottom: '.35rem' }}>Something went wrong</h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          We hit an unexpected error. Try again, and if it keeps happening let us know.
        </p>
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
