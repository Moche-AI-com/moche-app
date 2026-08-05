'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isProfileSectionActive, type ProfileSection } from '@/lib/dashboard/profile-nav';

/**
 * Left-nav for the profile shell (backlog P6-05).
 *
 * A client component only because the active item depends on the current path.
 * The section list itself is resolved on the server and passed in, so an invited
 * member never receives the owner-only entries in their HTML at all.
 *
 * On narrow screens the rail becomes a horizontally scrollable row of pills
 * rather than a ten-item stack the host has to scroll past to reach the content.
 */
export function ProfileNav({ sections }: { sections: ProfileSection[] }) {
  const pathname = usePathname();

  return (
    <nav className="profile-nav" aria-label="Profile settings sections">
      <ul className="profile-nav-list">
        {sections.map((s) => {
          const active = isProfileSectionActive(pathname, s);
          return (
            <li key={s.key}>
              <Link
                href={s.href}
                className={active ? 'profile-nav-link is-active' : 'profile-nav-link'}
                aria-current={active ? 'page' : undefined}
                data-testid={`profile-nav-${s.key}`}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
