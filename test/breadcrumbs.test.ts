import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs } from '@/lib/dashboard/breadcrumbs';

const TICKET_ID = '4f3c2a1b-9d8e-4c7b-a6f5-0e1d2c3b4a59';

describe('buildBreadcrumbs', () => {
  it('renders no trail for the dashboard root', () => {
    expect(buildBreadcrumbs('/dashboard')).toEqual([]);
  });

  it('links every ancestor on a normal nested page', () => {
    const crumbs = buildBreadcrumbs('/dashboard/reports/stays');
    expect(crumbs).toEqual([
      { label: 'Home', href: '/dashboard' },
      { label: 'Reports', href: '/dashboard/reports' },
      { label: 'Stays', href: null },
    ]);
  });

  it('routes the Service report crumb to the Service tab, not a 404', () => {
    // Regression: "Service report" used to link to /dashboard/reports/service-request,
    // a grouping segment with no page of its own. It now routes to the Service
    // tab — where a host going back from a report expects to land.
    const crumbs = buildBreadcrumbs(`/dashboard/reports/service-request/${TICKET_ID}`);
    expect(crumbs).toEqual([
      { label: 'Home', href: '/dashboard' },
      { label: 'Reports', href: '/dashboard/reports' },
      { label: 'Service report', href: '/dashboard/service-requests' },
      { label: 'Report', href: null },
    ]);
  });

  it('labels id segments from the provided names map', () => {
    const crumbs = buildBreadcrumbs(`/dashboard/properties/${TICKET_ID}/stays`, {
      names: { [TICKET_ID]: 'Ocean View' },
    });
    expect(crumbs).toEqual([
      { label: 'Home', href: '/dashboard' },
      { label: 'Properties', href: '/dashboard/properties' },
      { label: 'Ocean View', href: `/dashboard/properties/${TICKET_ID}` },
      { label: 'Stays', href: null },
    ]);
  });
});
