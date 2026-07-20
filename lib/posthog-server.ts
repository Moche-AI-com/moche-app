import 'server-only';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';

// Lightweight server-side PostHog capture via the public capture endpoint using native
// fetch (no posthog-node dependency). No-ops when POSTHOG_KEY is unset. Best-effort and
// non-throwing: analytics must never break a request path. Only pass non-PII properties.
export async function capture(
  event: string,
  distinctId: string,
  properties?: Record<string, string | number | boolean | null>,
): Promise<void> {
  const key = serverEnv.posthogServerKey;
  if (!key) return;
  try {
    await fetch(`${serverEnv.posthogServerHost.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: 'moche-server' },
        timestamp: new Date().toISOString(),
      }),
      // Never let analytics latency dominate the request.
      cache: 'no-store',
    });
  } catch (e) {
    log.warn('posthog_capture_failed', { event, error: String(e) });
  }
}
