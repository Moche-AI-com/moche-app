import { describe, expect, it } from 'vitest';
import {
  isPropertySectionActive,
  propertySectionLabel,
  propertySections,
} from '@/app/dashboard/properties/[id]/PropertyWorkspaceNav';

const propertyId = 'property-123';
const base = `/dashboard/properties/${propertyId}`;

describe('property workspace navigation', () => {
  it('builds the required workspace sections and gates edit-only sections', () => {
    // Manage Brain is intentionally ungated: every role with property access can
    // open the Brain, and the page downgrades itself to read-only when the role
    // lacks brain-edit capability.
    expect(propertySections(propertyId, false)).toEqual([
      { key: 'overview', label: 'Overview', href: base },
      { key: 'brain', label: 'Manage Brain', href: `${base}/brain` },
      { key: 'stays', label: 'Stays', href: `${base}/stays` },
      { key: 'local', label: 'Local Recs', href: `${base}/local` },
    ]);

    expect(propertySections(propertyId, true)).toEqual([
      { key: 'overview', label: 'Overview', href: base },
      { key: 'brain', label: 'Manage Brain', href: `${base}/brain` },
      { key: 'stays', label: 'Stays', href: `${base}/stays` },
      { key: 'local', label: 'Local Recs', href: `${base}/local` },
      { key: 'extras', label: 'Extras', href: `${base}/extras` },
      { key: 'settings', label: 'Configuration', href: `${base}/settings` },
    ]);
  });

  it('resolves breadcrumb labels, keeping legacy routes within their merged sections', () => {
    expect(propertySectionLabel(base, propertyId)).toBe('Overview');
    expect(propertySectionLabel(`${base}/stays`, propertyId)).toBe('Stays');
    // Guest chat and escalations merged into Stays; their legacy paths resolve there.
    expect(propertySectionLabel(`${base}/guest-chat`, propertyId)).toBe('Stays');
    expect(propertySectionLabel(`${base}/escalations`, propertyId)).toBe('Stays');
    expect(propertySectionLabel(`${base}/nearby`, propertyId)).toBe('Local Recs');
    expect(propertySectionLabel(`${base}/recommendations?view=all`, propertyId)).toBe('Local Recs');
    expect(propertySectionLabel(`${base}/brain`, propertyId)).toBe('Manage Brain');
  });

  it('marks only the matching section active for legacy Local routes', () => {
    const sections = propertySections(propertyId, true);
    const activeKeys = sections
      .filter((section) => isPropertySectionActive(`${base}/recommendations`, section, propertyId))
      .map((section) => section.key);

    expect(activeKeys).toEqual(['local']);
  });

  it('marks Manage Brain active on the Brain route and nothing else', () => {
    const sections = propertySections(propertyId, true);
    const activeKeys = sections
      .filter((section) => isPropertySectionActive(`${base}/brain`, section, propertyId))
      .map((section) => section.key);

    expect(activeKeys).toEqual(['brain']);
  });
});
