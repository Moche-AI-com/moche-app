'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { buildBreadcrumbs } from '@/lib/dashboard/breadcrumbs';

/**
 * Module-scoped and deliberately not persisted. It flips to true the first time
 * the pathname changes within a client-side navigation, and it resets on any full
 * page load. That is exactly the P6-06 requirement: the back affordance is
 * session-only, so a reloaded or deep-linked page offers the breadcrumb trail
 * instead of a browser-history jump that would land the host somewhere unrelated.
 */
let navigatedInSession = false;

export interface BreadcrumbsProps {
  /** property id -> display name, so an id segment reads as a place, not a uuid. */
  names?: Record<string, string>;
}

export function Breadcrumbs({ names }: BreadcrumbsProps) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(navigatedInSession);
  const [firstPath] = useState(pathname);

  useEffect(() => {
    if (pathname !== firstPath) {
      navigatedInSession = true;
      setCanGoBack(true);
    }
  }, [pathname, firstPath]);

  const crumbs = buildBreadcrumbs(pathname, { names });
  if (crumbs.length === 0) return null;

  return (
    <div className="crumb-row" data-testid="breadcrumbs">
      {canGoBack && (
        <button
          type="button"
          onClick={() => router.back()}
          className="crumb-back"
          data-testid="button-breadcrumb-back"
        >
          <ChevronLeft size={14} aria-hidden />
          Back
        </button>
      )}
      <nav aria-label="Breadcrumb" className="crumb-nav">
        <ol className="crumb-list">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="crumb-item">
                {i > 0 && <ChevronRight size={13} aria-hidden className="crumb-sep" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="crumb-link">{crumb.label}</Link>
                ) : (
                  <span className="crumb-current" aria-current="page">{crumb.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
