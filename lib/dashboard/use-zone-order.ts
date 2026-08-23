'use client';

import { useCallback, useEffect, useState } from 'react';

const ORDER_KEY = 'moche.dash.zoneOrder.v1';

function readOrder(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeOrder(values: string[]) {
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(values));
  } catch {
    // Storage unavailable (private mode, quota) — layout simply resets next visit.
  }
}

/**
 * Host-customizable ordering of the Operations Overview zones.
 *
 * Persisted per browser via localStorage, mirroring the collapsed-card and
 * dismissed-feed patterns in `use-dashboard-ui-state.ts`. The stored order is
 * reconciled against the zones that actually exist on every load: unknown ids
 * are dropped and new zones append at the end, so a saved layout survives
 * zones being added, renamed, or removed in future releases — no migration.
 */
export function useZoneOrder(defaultOrder: string[]) {
  const defaultsKey = defaultOrder.join('|');
  const [order, setOrder] = useState<string[]>(defaultOrder);

  useEffect(() => {
    const defaults = defaultsKey.split('|').filter(Boolean);
    const stored = readOrder();
    const known = new Set(defaults);
    const merged = [
      ...stored.filter((id) => known.has(id)),
      ...defaults.filter((id) => !stored.includes(id)),
    ];
    setOrder(merged.length > 0 ? merged : defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey]);

  const move = useCallback((id: string, targetIndex: number) => {
    setOrder((prev) => {
      const from = prev.indexOf(id);
      if (from === -1) return prev;
      const to = Math.max(0, Math.min(targetIndex, prev.length - 1));
      if (to === from) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, id);
      writeOrder(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const defaults = defaultsKey.split('|').filter(Boolean);
    setOrder(defaults);
    writeOrder(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey]);

  return { order, move, reset };
}
