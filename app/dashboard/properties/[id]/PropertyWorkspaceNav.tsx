'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type PropertySectionKey = 'overview' | 'stays' | 'guest-chat' | 'local' | 'extras' | 'settings';

export interface PropertySection {
  key: PropertySectionKey;
  label: string;
  href: string;
}

const SECTION_LABELS: Record<PropertySectionKey, string> = {
  overview: 'Overview',
  stays: 'Stays',
  'guest-chat': 'Guest Chat',
  local: 'Local Recs',
  extras: 'Extras',
  settings: 'Configuration',
};

/** Pure nav model shared by the property workspace and its unit tests. */
export function propertySections(propertyId: string, canEditProperty: boolean): PropertySection[] {
  const base = `/dashboard/properties/${propertyId}`;
  const sections: PropertySection[] = [
    { key: 'overview', label: SECTION_LABELS.overview, href: base },
    { key: 'stays', label: SECTION_LABELS.stays, href: `${base}/stays` },
    { key: 'guest-chat', label: SECTION_LABELS['guest-chat'], href: `${base}/guest-chat` },
    { key: 'local', label: SECTION_LABELS.local, href: `${base}/local` },
  ];

  if (canEditProperty) {
    sections.push(
      { key: 'extras', label: SECTION_LABELS.extras, href: `${base}/extras` },
      { key: 'settings', label: SECTION_LABELS.settings, href: `${base}/settings` },
    );
  }

  return sections;
}

function cleanPath(pathname: string) {
  return pathname.split('?')[0].replace(/\/+$/, '');
}

export function propertySectionLabel(pathname: string, propertyId: string): string {
  const path = cleanPath(pathname);
  const base = `/dashboard/properties/${propertyId}`;
  if (path === base) return SECTION_LABELS.overview;
  if (path.startsWith(`${base}/stays`)) return SECTION_LABELS.stays;
  if (path.startsWith(`${base}/guest-chat`) || path.startsWith(`${base}/escalations`)) return SECTION_LABELS['guest-chat'];
  if (
    path.startsWith(`${base}/local`) ||
    path.startsWith(`${base}/nearby`) ||
    path.startsWith(`${base}/recommendations`)
  ) {
    return SECTION_LABELS.local;
  }
  if (path.startsWith(`${base}/extras`)) return SECTION_LABELS.extras;
  if (path.startsWith(`${base}/brain`)) return 'Brain';
  if (path.startsWith(`${base}/welcome-card`)) return 'Welcome card';
  if (path.startsWith(`${base}/settings`) || path.startsWith(`${base}/appliances`)) {
    return SECTION_LABELS.settings;
  }
  return SECTION_LABELS.overview;
}

export function isPropertySectionActive(pathname: string, section: PropertySection, propertyId: string): boolean {
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
      <nav className="property-workspace-breadcrumb" aria-label="Property breadcrumb">
        <Link href="/dashboard/properties">Properties</Link>
        <span aria-hidden>/</span>
        <span>{propertyName}</span>
        <span aria-hidden>/</span>
        <strong>{currentLabel}</strong>
      </nav>
      <nav className="property-workspace-nav" aria-label="Property sections">
        <div className="property-workspace-nav-links">
          {sections.map((section) => {
            const active = isPropertySectionActive(pathname, section, propertyId);
            return (
              <Link
                key={section.key}
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={active ? 'active' : undefined}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <style jsx>{`
        .property-workspace-breadcrumb { grid-column: 1 / -1; display: flex; align-items: center; min-height: 2.75rem; gap: .45rem; font-size: .82rem; color: var(--text-muted); }
        .property-workspace-breadcrumb a { color: inherit; text-decoration: none; min-height: 2.75rem; display: inline-flex; align-items: center; }
        .property-workspace-breadcrumb strong { color: var(--text); font-weight: 650; }
        .property-workspace-nav { min-width: 0; }
        .property-workspace-nav-links { display: flex; flex-direction: column; gap: .25rem; }
        .property-workspace-nav-links a { display: flex; align-items: center; min-height: 2.35rem; padding: .45rem .65rem; border-radius: 10px; color: var(--text-muted); text-decoration: none; font-size: .9rem; }
        .property-workspace-nav-links a:hover, .property-workspace-nav-links a.active { color: var(--text); background: rgba(255,255,255,.07); }
        @media (max-width: 860px) {
          .property-workspace-main { grid-template-columns: minmax(0, 1fr) !important; }
          .property-workspace-header { grid-template-columns: minmax(0, 1fr) !important; }
          .property-workspace-nav { overflow-x: auto; padding-bottom: .2rem; scrollbar-width: thin; }
          .property-workspace-nav-links { flex-direction: row; min-width: max-content; }
        }
      `}</style>
    </>
  );
}
