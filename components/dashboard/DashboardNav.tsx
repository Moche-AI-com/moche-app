'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { logoutAction } from '@/app/(auth)/actions';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell, type NotificationItem } from '@/components/dashboard/NotificationBell';

// `ownerOnly` links are hidden from invited members (co-hosts, cleaners,
// managers). This is presentation only: hiding a tab is a courtesy so the nav
// reflects what the person can actually do, NOT a security boundary. The route
// itself still guards, and RLS still guards under that.
const LINKS: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/properties', label: 'Properties' },
  { href: '/dashboard/escalations', label: 'Escalations' },
  { href: '/dashboard/service-requests', label: 'Service' },
  { href: '/dashboard/extras', label: 'Extras' },
  { href: '/dashboard/updates', label: 'Review' },
  { href: '/dashboard/reports', label: 'Reports' },
  { href: '/dashboard/billing', label: 'Billing', ownerOnly: true },
  { href: '/dashboard/profile', label: 'Profile' },
];

export function DashboardNav({
  unread,
  notifications,
  isOwner = true,
}: {
  unread: number;
  notifications: NotificationItem[];
  /** Defaults to true so an omitted prop can never silently hide a real owner's billing tab. */
  isOwner?: boolean;
}) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => !l.ownerOnly || isOwner);
  return (
    <header className="dash-nav" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div className="wrap dash-nav-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: '1rem' }}>
        <div className="dash-nav-brandrow" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Logo href="/dashboard" size={32} />
          <div className="dash-nav-controls-mobile" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
            <NotificationBell unread={unread} items={notifications} />
            <ThemeToggle />
            <form action={logoutAction}>
              <button className="btn btn-ghost btn-sm" type="submit">Sign out</button>
            </form>
          </div>
        </div>
        <nav className="dash-nav-links" style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
          {links.map((l) => {
            const active = l.href === '/dashboard' ? pathname === l.href : pathname.startsWith(l.href);
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
          <ThemeToggle />
          <form action={logoutAction}>
            <button className="btn btn-ghost btn-sm" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
