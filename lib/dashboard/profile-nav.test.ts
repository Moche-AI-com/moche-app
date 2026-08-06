import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  PROFILE_SECTIONS,
  activeProfileSection,
  isProfileSectionActive,
  visibleProfileSections,
} from './profile-nav';

describe('PROFILE_SECTIONS', () => {
  it('has the ten sections the plan calls for', () => {
    expect(PROFILE_SECTIONS).toHaveLength(10);
  });

  it('uses unique keys and unique hrefs', () => {
    expect(new Set(PROFILE_SECTIONS.map((s) => s.key)).size).toBe(PROFILE_SECTIONS.length);
    expect(new Set(PROFILE_SECTIONS.map((s) => s.href)).size).toBe(PROFILE_SECTIONS.length);
  });

  it('replaces the legacy legal section with owner-only user management', () => {
    const legal = PROFILE_SECTIONS.find((section) => section.key === 'legal');
    const userManagement = PROFILE_SECTIONS.find((section) => section.key === 'user-management');
    expect(legal).toBeUndefined();
    expect(userManagement).toMatchObject({
      href: '/dashboard/profile/user-management',
      label: 'User management',
      ownerOnly: true,
    });
  });

  it('keeps every section under the profile shell', () => {
    for (const s of PROFILE_SECTIONS) {
      expect(s.href.startsWith('/dashboard/profile')).toBe(true);
    }
  });

  it('gives every section a label and a summary a host can read', () => {
    for (const s of PROFILE_SECTIONS) {
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.summary.length).toBeGreaterThan(10);
      // Guest-facing vocabulary rule applies to host copy too: no jargon we banned.
      expect(s.label.toLowerCase()).not.toContain('upsell');
      expect(s.summary.toLowerCase()).not.toContain('upsell');
    }
  });

  it('points every nav item at a route that actually exists', () => {
    // The nav is the only way into most of these pages, so a typo'd href would be
    // a dead end that no type error would catch.
    const root = path.join(process.cwd(), 'app');
    for (const s of PROFILE_SECTIONS) {
      const rel = s.href.replace(/^\//, '');
      expect(existsSync(path.join(root, rel, 'page.tsx'))).toBe(true);
    }
  });
});

describe('visibleProfileSections', () => {
  it('shows owners everything', () => {
    expect(visibleProfileSections(true)).toHaveLength(PROFILE_SECTIONS.length);
  });

  it('hides owner-only sections from an invited member instead of failing them later', () => {
    const forMember = visibleProfileSections(false);
    expect(forMember.every((s) => !s.ownerOnly)).toBe(true);
    expect(forMember.map((s) => s.key)).not.toContain('billing');
    expect(forMember.map((s) => s.key)).not.toContain('user-management');
    expect(forMember.map((s) => s.key)).toContain('security');
  });
});

describe('activeProfileSection', () => {
  it('matches the exact section, not the overview prefix', () => {
    expect(activeProfileSection('/dashboard/profile/billing')?.key).toBe('billing');
    expect(activeProfileSection('/dashboard/profile/security')?.key).toBe('security');
  });

  it('matches the overview only at the root', () => {
    expect(activeProfileSection('/dashboard/profile')?.key).toBe('overview');
  });

  it('keeps a nested path on its own section', () => {
    expect(activeProfileSection('/dashboard/profile/access/some-property')?.key).toBe('access');
  });

  it('tolerates a trailing slash', () => {
    expect(activeProfileSection('/dashboard/profile/usage/')?.key).toBe('usage');
  });

  it('returns null outside the shell', () => {
    expect(activeProfileSection('/dashboard/properties')).toBeNull();
    expect(activeProfileSection('/dashboard')).toBeNull();
  });
});

describe('isProfileSectionActive', () => {
  it('lights exactly one item per path', () => {
    for (const path of ['/dashboard/profile', '/dashboard/profile/details', '/dashboard/profile/user-management']) {
      const active = PROFILE_SECTIONS.filter((s) => isProfileSectionActive(path, s));
      expect(active).toHaveLength(1);
    }
  });
});
