import { describe, it, expect } from 'vitest';
import { activeNavHref, isNavActive } from './nav-active';

const HREFS = [
  '/dashboard',
  '/dashboard/properties',
  '/dashboard/escalations',
  '/dashboard/service-requests',
  '/dashboard/extras',
  '/dashboard/updates',
  '/dashboard/reports',
  '/dashboard/profile/billing',
  '/dashboard/profile',
];

describe('activeNavHref', () => {
  it('lights the dashboard root only on an exact match', () => {
    expect(activeNavHref('/dashboard', HREFS)).toBe('/dashboard');
    expect(activeNavHref('/dashboard/reports', HREFS)).toBe('/dashboard/reports');
  });

  it('prefers the more specific tab when one href is a prefix of another', () => {
    // The regression this module exists for: Billing lives inside the profile
    // shell, so both tabs used to light at once.
    expect(activeNavHref('/dashboard/profile/billing', HREFS)).toBe('/dashboard/profile/billing');
  });

  it('keeps other profile sections on the Profile tab', () => {
    expect(activeNavHref('/dashboard/profile', HREFS)).toBe('/dashboard/profile');
    expect(activeNavHref('/dashboard/profile/security', HREFS)).toBe('/dashboard/profile');
    expect(activeNavHref('/dashboard/profile/usage', HREFS)).toBe('/dashboard/profile');
  });

  it('matches nested routes to their tab', () => {
    expect(activeNavHref('/dashboard/properties/abc/local', HREFS)).toBe('/dashboard/properties');
  });

  it('does not match a sibling with a shared prefix string', () => {
    expect(activeNavHref('/dashboard/properties-archive', HREFS)).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(activeNavHref('/dashboard/reports/', HREFS)).toBe('/dashboard/reports');
  });

  it('returns null for a route with no tab', () => {
    expect(activeNavHref('/dashboard/notifications', HREFS)).toBeNull();
  });
});

describe('isNavActive', () => {
  it('lights exactly one tab for every dashboard path it is given', () => {
    const paths = [
      '/dashboard',
      '/dashboard/properties',
      '/dashboard/profile',
      '/dashboard/profile/billing',
      '/dashboard/profile/user-management',
      '/dashboard/reports/service-request/xyz',
    ];
    for (const p of paths) {
      expect(HREFS.filter((h) => isNavActive(p, h, HREFS))).toHaveLength(1);
    }
  });
});
