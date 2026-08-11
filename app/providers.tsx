'use client';

import { useCallback, useEffect, useState } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { CookieConsent, readConsent, type Consent } from '@/components/CookieConsent';

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

function initPostHog() {
  if (!key || typeof window === 'undefined') return;
  if (posthog.__loaded) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    // Privacy-first defaults: no autocapture of DOM content, mask inputs.
    autocapture: false,
    persistence: 'localStorage+cookie',
  });
}

/**
 * Initializes PostHog on the client, but only after the visitor has explicitly
 * accepted analytics cookies. No-ops when the key is unset. Until consent is
 * granted, `posthog.init` is never called, so no analytics cookie or localStorage
 * entry is written -- which is what keeps this compliant with GDPR/ePrivacy and
 * consistent with the published Cookie Policy.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(null);

  // Hydration marker read by the boot script in app/layout.tsx. If this never
  // runs, the boot script's 2.5s timer forces every <Reveal> section visible so
  // a failed hydration cannot leave the landing page blank. Set in its own
  // effect, before the PostHog effect, so an analytics failure can never
  // prevent the marker from being written.
  useEffect(() => {
    document.documentElement.setAttribute('data-hydrated', '1');
  }, []);

  useEffect(() => {
    setConsent(readConsent());
  }, []);

  useEffect(() => {
    if (consent === 'granted') initPostHog();
  }, [consent]);

  const handleDecision = useCallback((value: Consent) => {
    setConsent(value);
  }, []);

  if (!key) return <>{children}</>;

  return (
    <PostHogProvider client={posthog}>
      {children}
      <CookieConsent onDecision={handleDecision} />
    </PostHogProvider>
  );
}
