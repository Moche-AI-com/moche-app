'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

interface PostHogIdentifyProps {
  userId: string;
  fullName: string | null;
}

export function PostHogIdentify({ userId, fullName }: PostHogIdentifyProps) {
  useEffect(() => {
    posthog.identify(userId, { name: fullName ?? undefined });
  }, [userId, fullName]);

  return null;
}
