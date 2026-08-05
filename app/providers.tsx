'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

// Initializes PostHog once on the client. No-ops when the key is unset.
export function Providers({ children }: { children: React.ReactNode }) {
  // Hydration marker read by the boot script in app/layout.tsx. If this never
  // runs, the boot script's 2.5s timer forces every <Reveal> section visible so
  // a failed hydration cannot leave the landing page blank. Set in its own
  // effect, before the PostHog effect, so an analytics failure can never
  // prevent the marker from being written.
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', '1');
  }, []);

  useEffect(() => {
    if (!key || typeof window === 'undefined') return;
    if (posthog.__loaded) return;
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      // Privacy-first defaults: no autocapture of DOM content, mask inputs.
      autocapture: false,
      persistence: 'localStorage+cookie',
    });
  }, []);

  if (!key) return <>{children}</>;
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
