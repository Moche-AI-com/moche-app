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
      { key: 'brain', label: 'Brain', href: `${base}/brain` },
      { key: 'updates', label: 'AI Updates', href: `${base}/updates` },
      { key: 'stays', label: 'Stays', href: `${base}/stays` },
      { key: 'escalations', label: 'Escalations', href: `${base}/escalations` },
      { key: 'local', label: 'Local Recs', href: `${base}/local` },
    ]);

    expect(propertySections(propertyId, true).map((section) => section.key)).toEqual([
      'overview',
      'brain',
      'updates',
      'stays',
      'escalations',
      'local',
      'extras',
      'settings',
    ]);
  });

  it('keeps Brain and AI Updates adjacent, since they are the same job seen twice', () => {
    const keys = propertySections(propertyId, true).map((section) => section.key);
    expect(keys.indexOf('updates')).toBe(keys.indexOf('brain') + 1);
  });

  it('resolves breadcrumb labels, keeping legacy Local manager routes within Local Recs', () => {
    expect(propertySectionLabel(base, propertyId)).toBe('Overview');
    expect(propertySectionLabel(`${base}/stays`, propertyId)).toBe('Stays');
    expect(propertySectionLabel(`${base}/nearby`, propertyId)).toBe('Local Recs');
    expect(propertySectionLabel(`${base}/recommendations?view=all`, propertyId)).toBe('Local Recs');
    expect(propertySectionLabel(`${base}/brain`, propertyId)).toBe('Brain');
    expect(propertySectionLabel(`${base}/updates`, propertyId)).toBe('AI Updates');
    expect(propertySectionLabel(`${base}/updates?view=reviewed`, propertyId)).toBe('AI Updates');
  });

  it('marks only the matching nav section active', () => {
    const sections = propertySections(propertyId, true);
    const activeKeys = sections
      .filter((section) => isPropertySectionActive(`${base}/recommendations`, section, propertyId))
      .map((section) => section.key);

    expect(activeKeys).toEqual(['local']);
  });

  it('lights exactly one tab for the Brain and AI Updates routes, never both', () => {
    const sections = propertySections(propertyId, true);
    for (const [path, expected] of [
      [`${base}/brain`, 'brain'],
      [`${base}/brain?edit=abc`, 'brain'],
      [`${base}/updates`, 'updates'],
      [`${base}/updates?view=reviewed`, 'updates'],
    ] as const) {
      const active = sections
        .filter((section) => isPropertySectionActive(path, section, propertyId))
        .map((section) => section.key);
      expect(active, path).toEqual([expected]);
    }
  });
});
