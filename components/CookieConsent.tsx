'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export const CONSENT_KEY = 'moche_analytics_consent';

export type Consent = 'granted' | 'denied';

/**
 * Reads the stored analytics consent decision. Returns null when the visitor has
 * not decided yet, which is the state that must keep PostHog uninitialised.
 */
export function readConsent(): Consent | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    // Private browsing or blocked storage: treat as undecided, which means no analytics.
    return null;
  }
}

function writeConsent(value: Consent) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Storage unavailable. The banner will reappear next visit; analytics stay off.
  }
}

/**
 * Bottom-anchored consent banner. Renders only while the visitor has made no
 * decision, so returning visitors never see it again. Calling `onDecision` is
 * what allows Providers to initialise PostHog, so analytics cannot start before
 * an explicit opt-in.
 */
export function CookieConsent({ onDecision }: { onDecision: (consent: Consent) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsent() === null);
  }, []);

  function decide(value: Consent) {
    writeConsent(value);
    setVisible(false);
    onDecision(value);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-heading"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-lg sm:flex-row sm:items-center sm:gap-6">
        <div className="flex-1">
          <h2 id="cookie-consent-heading" className="font-display text-base font-semibold text-text">
            Analytics cookies
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            We use product analytics to understand how Moche-AI is used. Nothing is stored until you
            agree. Read our{' '}
            <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-text">
              Cookie Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => decide('denied')}
            className="min-h-[44px] rounded-md border border-border px-5 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="min-h-[44px] rounded-md bg-teal px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
