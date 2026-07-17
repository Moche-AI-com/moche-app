'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      defaults: '2026-01-30',
      capture_exceptions: true,
      capture_pageview: false,
      debug: process.env.NODE_ENV === 'development',
    });
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogInstance = usePostHog();

  useEffect(() => {
    if (pathname && posthogInstance) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) url = url + `?${search}`;
      posthogInstance.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams, posthogInstance]);

  return null;
}
