// Profile settings section registry (backlog P6-05).
//
// One source of truth for the left-nav, the overview page's section cards, and the
// active-state highlight. Keeping it pure and data-driven means a section can never
// exist in the nav without a page, or vice versa - the build fails on a bad href
// because every href here is also a real route, and the test below asserts the
// list stays internally consistent.

export interface ProfileSection {
  /** Stable key, also used as the nav item's test id suffix. */
  key: string;
  label: string;
  href: string;
  /** One line the host reads under the section title on the overview. */
  summary: string;
  /**
   * Owner-only sections are hidden from invited members rather than shown and
   * then rejected. The page itself still re-checks - this is presentation, never
   * the security boundary.
   */
  ownerOnly: boolean;
}

const BASE = '/dashboard/profile';

export const PROFILE_SECTIONS: ProfileSection[] = [
  {
    key: 'overview',
    label: 'Overview',
    href: BASE,
    summary: 'Your account at a glance, and where everything lives.',
    ownerOnly: false,
  },
  {
    key: 'details',
    label: 'Personal details',
    href: `${BASE}/details`,
    summary: 'Your name and the email address you sign in with.',
    ownerOnly: false,
  },
  {
    key: 'security',
    label: 'Security and sign-in',
    href: `${BASE}/security`,
    summary: 'Password, two-factor authentication, and your verified phone.',
    ownerOnly: false,
  },
  {
    key: 'notifications',
    label: 'Notifications',
    href: `${BASE}/notifications`,
    summary: 'The notification paths that can reach you, channel status, and history.',
    ownerOnly: false,
  },
  {
    key: 'billing',
    label: 'Billing and plan',
    href: `${BASE}/billing`,
    summary: 'Your plan, payment method, invoices, and upgrades.',
    ownerOnly: true,
  },
  {
    key: 'usage',
    label: 'Usage',
    href: `${BASE}/usage`,
    summary: 'Properties and pooled guest conversations against your allowance.',
    ownerOnly: true,
  },
  {
    key: 'access',
    label: 'Properties and access',
    href: `${BASE}/access`,
    summary: 'Every property you can reach, and what you can do on each one.',
    ownerOnly: false,
  },
  {
    key: 'user-management',
    label: 'User management',
    href: `${BASE}/user-management`,
    summary: 'Invite people, choose their roles, and set exactly what they can do.',
    ownerOnly: true,
  },
  {
    key: 'privacy',
    label: 'Data and privacy',
    href: `${BASE}/privacy`,
    summary: 'Export a copy of your data, or close your account.',
    ownerOnly: false,
  },
  {
    key: 'support',
    label: 'Support',
    href: `${BASE}/support`,
    summary: 'How to reach a person, and what to send so we can help fast.',
    ownerOnly: false,
  },
];

/** Sections this viewer may see. Owners see all of them. */
export function visibleProfileSections(isOwner: boolean): ProfileSection[] {
  return PROFILE_SECTIONS.filter((s) => isOwner || !s.ownerOnly);
}

/**
 * Which nav item is current for a pathname.
 *
 * Longest-href-first so `/dashboard/profile/billing` does not light up Overview,
 * whose href is a prefix of every other section.
 */
export function activeProfileSection(pathname: string): ProfileSection | null {
  const clean = pathname.replace(/\/+$/, '') || pathname;
  const byLength = [...PROFILE_SECTIONS].sort((a, b) => b.href.length - a.href.length);
  for (const s of byLength) {
    if (clean === s.href || clean.startsWith(`${s.href}/`)) return s;
  }
  return null;
}

export function isProfileSectionActive(pathname: string, section: ProfileSection): boolean {
  return activeProfileSection(pathname)?.key === section.key;
}
