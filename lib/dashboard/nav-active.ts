// Top-nav active-state resolution.
//
// A plain `pathname.startsWith(href)` broke once Billing moved inside the profile
// shell (backlog P3-10): /dashboard/profile/billing starts with both
// /dashboard/profile and /dashboard/profile/billing, so two tabs lit at once.
// The rule is "the most specific matching tab wins", which needs to know about the
// whole tab list rather than one href at a time.

export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  const clean = pathname.replace(/\/+$/, '') || pathname;
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = href === '/dashboard'
      // The dashboard root is a prefix of every other tab, so it only ever
      // matches exactly.
      ? clean === href
      : clean === href || clean.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export function isNavActive(pathname: string, href: string, hrefs: string[]): boolean {
  return activeNavHref(pathname, hrefs) === href;
}
