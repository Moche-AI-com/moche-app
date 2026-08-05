import { describe, it, expect } from 'vitest';
import { buildBreadcrumbs, hasBreadcrumbs, segmentLabel } from './breadcrumbs';

const PROP = '11111111-2222-3333-4444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('buildBreadcrumbs', () => {
  it('renders nothing at the dashboard root', () => {
    expect(buildBreadcrumbs('/dashboard')).toEqual([]);
    expect(buildBreadcrumbs('/dashboard/')).toEqual([]);
    expect(hasBreadcrumbs('/dashboard')).toBe(false);
  });

  it('ignores paths outside the dashboard', () => {
    expect(buildBreadcrumbs('/g/some-slug')).toEqual([]);
    expect(buildBreadcrumbs('/')).toEqual([]);
    expect(buildBreadcrumbs('')).toEqual([]);
  });

  it('links every ancestor and leaves the current page unlinked', () => {
    expect(buildBreadcrumbs('/dashboard/properties')).toEqual([
      { label: 'Home', href: '/dashboard' },
      { label: 'Properties', href: null },
    ]);
    expect(hasBreadcrumbs('/dashboard/properties')).toBe(true);
  });

  it('builds literal ancestor hrefs so a deep link stands alone', () => {
    const crumbs = buildBreadcrumbs(`/dashboard/properties/${PROP}/brain`);
    expect(crumbs.map((c) => c.href)).toEqual([
      '/dashboard',
      '/dashboard/properties',
      `/dashboard/properties/${PROP}`,
      null,
    ]);
  });

  it('resolves an id segment to a display name when one is known', () => {
    const crumbs = buildBreadcrumbs(`/dashboard/properties/${PROP}/extras`, {
      names: { [PROP]: 'Sunset Loft' },
    });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Properties', 'Sunset Loft', 'Enhancements']);
  });

  it('never shows a raw uuid when the name is unknown', () => {
    const crumbs = buildBreadcrumbs(`/dashboard/properties/${PROP}/stays`);
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Properties', 'Property', 'Stays']);
    for (const crumb of crumbs) expect(crumb.label).not.toContain(PROP);
  });

  it('falls back per parent segment for other id routes', () => {
    expect(buildBreadcrumbs(`/dashboard/escalations/${OTHER}`).map((c) => c.label))
      .toEqual(['Home', 'Escalations', 'Escalation']);
    expect(buildBreadcrumbs(`/dashboard/reports/service-request/${OTHER}`).map((c) => c.label))
      .toEqual(['Home', 'Reports', 'Service report', 'Report']);
  });

  it('uses the Enhancements label, never the word upsell', () => {
    const labels = buildBreadcrumbs(`/dashboard/properties/${PROP}/extras`).map((c) => c.label);
    expect(labels).toContain('Enhancements');
    expect(labels.join(' ').toLowerCase()).not.toContain('upsell');
  });

  it('title-cases an unmapped segment rather than dropping it', () => {
    const crumbs = buildBreadcrumbs('/dashboard/some-new-area');
    expect(crumbs[1]).toEqual({ label: 'Some new area', href: null });
  });

  it('strips a query string and hash', () => {
    expect(buildBreadcrumbs('/dashboard/properties?page=2').map((c) => c.label))
      .toEqual(['Home', 'Properties']);
    expect(buildBreadcrumbs('/dashboard/properties#top').map((c) => c.label))
      .toEqual(['Home', 'Properties']);
  });

  it('tolerates duplicate slashes', () => {
    expect(buildBreadcrumbs('//dashboard//properties//').map((c) => c.label))
      .toEqual(['Home', 'Properties']);
  });
});

describe('segmentLabel', () => {
  it('prefers the curated label', () => {
    expect(segmentLabel('welcome-card')).toBe('Welcome card');
    expect(segmentLabel('nearby')).toBe('Nearby places');
  });

  it('falls back to title case', () => {
    expect(segmentLabel('audit_log')).toBe('Audit log');
    expect(segmentLabel('x')).toBe('X');
  });
});
