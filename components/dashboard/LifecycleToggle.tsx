import Link from 'next/link';
import { Inbox, Archive } from 'lucide-react';
import type { LifecycleView } from '@/lib/dashboard/lifecycle';

// Shared Active/Past switch for every surface that has a lifecycle (Stays,
// Service requests, and anything added later).
//
// Server-rendered links, not client state, matching PropertyFilter.tsx: the
// choice lives in the URL, so it survives a refresh, is shareable, deep-links
// work with JavaScript disabled, and the back button behaves the way a browser
// back button is supposed to. A useState tab would break all four.
//
// Counts are optional. When omitted the pill just reads "Active" / "Past" —
// better than rendering a confident "0" for a number the caller never
// actually counted.

// The pure helpers live in lib/dashboard/lifecycle.ts so they are unit testable
// without a React/DOM environment; re-exported here so page files need only one
// import for both the parsing and the rendering half.
export type { LifecycleView } from '@/lib/dashboard/lifecycle';
export { parseLifecycleView, lifecycleStatusFor } from '@/lib/dashboard/lifecycle';

export function LifecycleToggle({
  basePath,
  view,
  activeCount,
  pastCount,
  extraParams,
  pastLabel = 'Past',
  ariaLabel = 'Filter by status',
}: {
  /** Path without query string, e.g. '/dashboard/service-requests'. */
  basePath: string;
  view: LifecycleView;
  activeCount?: number;
  pastCount?: number;
  /** Other query params to preserve, e.g. the selected property. */
  extraParams?: Record<string, string | undefined>;
  pastLabel?: string;
  ariaLabel?: string;
}) {
  function href(next: LifecycleView) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    // 'active' is the default, so it stays out of the URL. Keeps the canonical
    // path clean and means one state has exactly one URL.
    if (next === 'past') params.set('view', 'past');
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const tabs = [
    { key: 'active' as const, label: 'Active', count: activeCount, Icon: Inbox },
    { key: 'past' as const, label: pastLabel, count: pastCount, Icon: Archive },
  ];

  return (
    <div className="esc-filter-row" role="tablist" aria-label={ariaLabel} data-testid="lifecycle-toggle">
      {tabs.map(({ key, label, count, Icon }) => {
        const isActive = view === key;
        return (
          <Link
            key={key}
            href={href(key)}
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'true' : undefined}
            className={`esc-filter-pill${isActive ? ' is-active' : ''}`}
            data-testid={`lifecycle-tab-${key}`}
          >
            <Icon size={13} aria-hidden />
            {label}
            {typeof count === 'number' && (
              <span className={`esc-filter-count${key === 'active' && count > 0 ? ' has-open' : ''}`}>{count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
