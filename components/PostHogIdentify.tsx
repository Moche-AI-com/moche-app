'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

// Identifies the authenticated host by user id only. Email is included only if the caller
// passes it (it is already exposed to the logged-in host). No other PII is attached.
export function PostHogIdentify({ userId, email }: { userId: string; email?: string | null }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) return;
    posthog.identify(userId, email ? { email } : undefined);
  }, [userId, email]);

  return null;
}
