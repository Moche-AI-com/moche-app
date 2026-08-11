'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type PropertySectionKey = 'overview' | 'stays' | 'escalations' | 'local' | 'extras' | 'settings';

export interface PropertySection {
  key: PropertySectionKey;
  label: string;
  href: string;
}

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  stays: 'Stays',
  escalations: 'Escalations',
  local: 'Local Recs',
  nearby: 'Local Recs',
  recommendations: 'Local Recs',
  extras: 'Extras',
  settings: 'Configuration',
  brain: 'Brain',
  'welcome-card': 'Welcome card',
};

/** Pure nav model shared by the property workspace and its unit tests. */
export function propertySections(propertyId: string, canEditProperty: boolean): PropertySection[] {
  const base = `/dashboard/properties/${propertyId}`;
  const sections: PropertySection[] = [
    { key: 'overview', label: 'Overview', href: base },
    { key: 'stays', label: 'Stays', href: `${base}/stays` },
    { key: 'escalations', label: 'Escalations', href: `${base}/escalations` },
    { key: 'local', label: 'Local Recs', href: `${base}/local` },
  ];

  if (canEditProperty) {
    sections.push(
      { key: 'extras', label: 'Extras', href: `${base}/extras` },
      { key: 'settings', label: 'Configuration', href: `${base}/settings` },
    );
  }

  return sections;
}

/** Returns the workspace label for a pathname, including legacy Local manager URLs. */
export function propertySectionLabel(pathname: string | null | undefined, propertyId: string): string {
  const base = `/dashboard/properties/${propertyId}`;
  const normalized = (pathname ?? '').split(/[?#]/)[0].replace(/\/+$/, '');
  if (!normalized || normalized === base) return SECTION_LABELS.overview;

  const segment = normalized.slice(base.length).split('/').filter(Boolean)[0];
  return SECTION_LABELS[segment] ?? 'Property';
}

export function isPropertySectionActive(pathname: string | null | undefined, section: PropertySection, propertyId: string): boolean {
  return propertySectionLabel(pathname, propertyId) === section.label;
}

export function PropertyWorkspaceNav({
  propertyId,
  propertyName,
  canEditProperty,
}: {
  propertyId: string;
  propertyName: string;
  canEditProperty: boolean;
}) {
  const pathname = usePathname();
  const sections = propertySections(propertyId, canEditProperty);
  const currentLabel = propertySectionLabel(pathname, propertyId);

  return (
    <>
      <style>{`
        .property-workspace-breadcrumb { grid-column: 1 / -1; display: flex; align-items: center; min-height: 2.75rem; gap: .45rem; font-size: .82rem; color: var(--text-muted); }
        .property-workspace-breadcrumb a { color: inherit; text-decoration: none; min-height: 2.75rem; display: inline-flex; align-items: center; }
        .property-workspace-nav { min-width: 0; }
        .property-workspace-nav-links { display: flex; flex-direction: column; gap: .35rem; position: sticky; top: 1rem; }
        .property-workspace-nav-link { align-items: center; border-radius: var(--radius-md); color: var(--text-muted); display: flex; font-size: .9rem; font-weight: 600; min-height: 2.75rem; padding: .5rem .75rem; text-decoration: none; }
        .property-workspace-nav-link:hover { background: var(--surface); color: var(--text); }
        .property-workspace-nav-link.is-active { background: color-mix(in srgb, var(--teal) 13%, var(--surface)); color: var(--teal); }
        @media (max-width: 899px) {
          .property-workspace-main { grid-template-columns: minmax(0, 1fr) !important; }
          .property-workspace-header { grid-template-columns: minmax(0, 1fr) !important; }
          .property-workspace-nav { overflow-x: auto; padding-bottom: .2rem; scrollbar-width: thin; }
          .property-workspace-nav-links { flex-direction: row; gap: .5rem; position: static; width: max-content; min-width: 100%; }
          .property-workspace-nav-link { border: 1px solid var(--border); min-width: max-content; padding-inline: .9rem; }
          .property-workspace-nav-link.is-active { border-color: color-mix(in srgb, var(--teal) 45%, var(--border)); }
        }
      `}</style>
      <nav className="property-workspace-breadcrumb" aria-label="Property breadcrumb">
        <Link href="/dashboard/properties">Properties</Link>
        <span aria-hidden>/</span>
        <span>{propertyName}</span>
        <span aria-hidden>/</span>
        <span aria-current="page">{currentLabel}</span>
      </nav>
      <nav className="property-workspace-nav" aria-label="Property sections">
        <div className="property-workspace-nav-links">
          {sections.map((section) => {
            const active = isPropertySectionActive(pathname, section, propertyId);
            return (
              <Link
                key={section.key}
                href={section.href}
                className={`property-workspace-nav-link${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
