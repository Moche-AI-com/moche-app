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
    expect(propertySections(propertyId, false)).toEqual([
      { key: 'overview', label: 'Overview', href: base },
      { key: 'stays', label: 'Stays', href: `${base}/stays` },
      { key: 'escalations', label: 'Escalations', href: `${base}/escalations` },
      { key: 'local', label: 'Local Recs', href: `${base}/local` },
    ]);

    expect(propertySections(propertyId, true).map((section) => section.key)).toEqual([
      'overview',
      'stays',
      'escalations',
      'local',
      'extras',
      'settings',
    ]);
  });

  it('resolves breadcrumb labels, keeping legacy Local manager routes within Local Recs', () => {
    expect(propertySectionLabel(base, propertyId)).toBe('Overview');
    expect(propertySectionLabel(`${base}/stays`, propertyId)).toBe('Stays');
    expect(propertySectionLabel(`${base}/nearby`, propertyId)).toBe('Local Recs');
    expect(propertySectionLabel(`${base}/recommendations?view=all`, propertyId)).toBe('Local Recs');
    expect(propertySectionLabel(`${base}/brain`, propertyId)).toBe('Brain');
  });

  it('marks only the matching nav section active', () => {
    const sections = propertySections(propertyId, true);
    const activeKeys = sections
      .filter((section) => isPropertySectionActive(`${base}/recommendations`, section, propertyId))
      .map((section) => section.key);

    expect(activeKeys).toEqual(['local']);
  });
});
