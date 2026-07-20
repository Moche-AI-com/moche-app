// Next.js instrumentation hook — loads the correct Sentry config per runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export async function onRequestError(...args: unknown[]) {
  const Sentry = await import('@sentry/nextjs');
  // captureRequestError exists in @sentry/nextjs v8+; guard for safety.
  const capture = (Sentry as { captureRequestError?: (...a: unknown[]) => void }).captureRequestError;
  if (typeof capture === 'function') capture(...args);
}
