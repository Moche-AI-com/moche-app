'use client';

// Small persisted UI-state hooks for the home dashboard: which cards a host
// has collapsed, and which recent-activity rows they've cleared. Both are
// pure presentation state (nothing here touches the database), so
// localStorage is the right layer — it survives reloads on this device
// without a migration, and clearing browser data is a reasonable way for a
// host to "reset" the view if they ever want to.

import { useCallback, useEffect, useState } from 'react';

const COLLAPSED_KEY = 'moche-dash-collapsed-cards';
const DISMISSED_FEED_KEY = 'moche-dash-dismissed-feed';
// Feed queries cap at 10 rows at a time, so a host will never accumulate more
// than a handful of dismissals in practice. This ceiling just stops the
// stored array from growing without bound over months of daily use.
const MAX_DISMISSED = 200;

function readArray(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, values: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage full or disabled (private browsing) — collapse/dismiss state
    // just won't persist this session. Not worth surfacing to the host.
  }
}

/** Which dashboard cards are collapsed, keyed by a stable card id. */
export function useCollapsedCards() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Read localStorage after mount only, so server-rendered markup and the
  // first client render match (avoids a hydration mismatch warning) — cards
  // render expanded for one frame, then settle into the stored state.
  useEffect(() => {
    setCollapsed(new Set(readArray(COLLAPSED_KEY)));
  }, []);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeArray(COLLAPSED_KEY, Array.from(next));
      return next;
    });
  }, []);

  return { isCollapsed: (id: string) => collapsed.has(id), toggle };
}

/** Which recent-activity feed rows a host has cleared, one by one. */
export function useDismissedFeedItems() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    setDismissed(readArray(DISMISSED_FEED_KEY));
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id].slice(-MAX_DISMISSED);
      writeArray(DISMISSED_FEED_KEY, next);
      return next;
    });
  }, []);

  const restore = useCallback(() => {
    setDismissed([]);
    writeArray(DISMISSED_FEED_KEY, []);
  }, []);

  return { dismissedIds: dismissed, dismiss, restore };
}
