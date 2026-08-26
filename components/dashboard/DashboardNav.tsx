'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { NotificationBell, type NotificationItem } from '@/components/dashboard/NotificationBell';
import { ProfileMenu } from '@/components/dashboard/ProfileMenu';
import { isNavActive } from '@/lib/dashboard/nav-active';

// `ownerOnly` links are hidden from invited members (co-hosts, cleaners,
// managers). This is presentation only: hiding a tab is a courtesy so the nav
// reflects what the person can actually do, NOT a security boundary. The route
// itself still guards, and RLS still guards under that.
//
// Billing deliberately has NO top-level tab. It lives at
// /dashboard/profile/billing and is reached through the Profile left-nav, since
// Profile is where every other account-level setting already lives and a
// dedicated tab made the primary nav read as two competing account sections.
// The route and its Profile section entry both still exist — only the tab is
// gone — so existing links, Stripe return URLs, and upgrade CTAs keep working.
//
// Profile is no longer a tab either: account access moved into the ProfileMenu
// dropdown next to the notification bell, which also absorbed the header theme
// toggle and the sign-out button. Every /dashboard/profile route is unchanged.
const LINKS: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/properties', label: 'Properties' },
  { href: '/dashboard/escalations', label: 'Escalations' },
  { href: '/dashboard/service-requests', label: 'Service' },
  { href: '/dashboard/extras', label: 'Extras' },
  { href: '/dashboard/updates', label: 'Updates' },
  { href: '/dashboard/reports', label: 'Reports' },
];

export function DashboardNav({
  unread,
  notifications,
  displayName,
  isOwner = true,
}: {
  unread: number;
  notifications: NotificationItem[];
  /** Shown on the account-menu trigger; the layout derives it from
      profiles.full_name with the email as fallback. */
  displayName: string;
  /**
   * Defaults to true so an omitted prop can never silently hide a tab from a
   * real owner. No link is currently `ownerOnly` — the filter is kept because
   * owner-only tabs have been added and removed more than once, and losing the
   * mechanism means the next one gets hardcoded badly.
   */
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.ownerOnly || isOwner);
  const hrefs = links.map((l) => l.href);
  return (
    <header className="dash-nav" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div className="wrap dash-nav-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: '1rem' }}>
        <div className="dash-nav-brandrow" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Logo href="/dashboard" size={32} />
          <div className="dash-nav-controls-mobile" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <NotificationBell unread={unread} items={notifications} />
            <ProfileMenu displayName={displayName} />
          </div>
        </div>
        <nav className="dash-nav-links" style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
          {links.map((l) => {
            // Most-specific-tab-wins, because Billing now lives inside /dashboard/profile.
            const active = isNavActive(pathname, l.href, hrefs);
            return (
              // Styling lives entirely in globals.css (.dash-tab) — inline styles would
              // beat the :hover/:focus-visible rules and kill the hover affordance.
              <Link
                key={l.href}
                href={l.href}
                className={`dash-tab${active ? ' dash-tab-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="dash-nav-controls-desktop" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <NotificationBell unread={unread} items={notifications} />
          <ProfileMenu displayName={displayName} />
        </div>
      </div>
    </header>
  );
}
