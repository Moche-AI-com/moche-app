'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Brain,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  MapPin,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export type PropertySectionKey = 'overview' | 'brain' | 'stays' | 'inbox' | 'local' | 'extras' | 'settings';

export interface PropertySection {
  key: PropertySectionKey;
  label: string;
  href: string;
}

const SECTION_LABELS: Record<PropertySectionKey, string> = {
  overview: 'Overview',
  brain: 'Manage Brain',
  stays: 'Stays',
  inbox: 'Inbox',
  local: 'Local Recs',
  extras: 'Extras',
  settings: 'Configuration',
};

/* Icons are presentational only, so they live outside the pure nav model —
   propertySections() stays serializable for its unit tests. */
const SECTION_ICONS: Record<PropertySectionKey, LucideIcon> = {
  overview: LayoutDashboard,
  brain: Brain,
  stays: CalendarDays,
  inbox: Inbox,
  local: MapPin,
  extras: Sparkles,
  settings: Settings,
};

/** Pure nav model shared by the property workspace and its unit tests. */
export function propertySections(propertyId: string, canEditProperty: boolean, canReplyGuests = false): PropertySection[] {
  const base = `/dashboard/properties/${propertyId}`;
  const sections: PropertySection[] = [
    { key: 'overview', label: SECTION_LABELS.overview, href: base },
    // Manage Brain is deliberately ungated: every role with property access can
    // open the Brain (the page downgrades itself to read-only for roles without
    // brain-edit capability), and the header's brain-health card has always
    // linked there for everyone.
    { key: 'brain', label: SECTION_LABELS.brain, href: `${base}/brain` },
    { key: 'stays', label: SECTION_LABELS.stays, href: `${base}/stays` },
  ];

  // The Inbox is for roles that answer guests — the page and the guest-chats
  // API enforce the same gate, so hiding the entry just keeps the rail honest.
  if (canReplyGuests) {
    sections.push({ key: 'inbox', label: SECTION_LABELS.inbox, href: `${base}/inbox` });
  }

  sections.push({ key: 'local', label: SECTION_LABELS.local, href: `${base}/local` });

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
  // The legacy escalations route merged into the Stays tab; its old path still
  // resolves to the Stays label while the redirect stands.
  if (path.startsWith(`${base}/stays`) || path.startsWith(`${base}/escalations`)) return SECTION_LABELS.stays;
  if (
    path.startsWith(`${base}/local`) ||
    path.startsWith(`${base}/nearby`) ||
    path.startsWith(`${base}/recommendations`)
  ) {
    return SECTION_LABELS.local;
  }
  if (path.startsWith(`${base}/extras`)) return SECTION_LABELS.extras;
  if (path.startsWith(`${base}/brain`)) return SECTION_LABELS.brain;
  // Guest chat moved again — out of the Stays tab and into the Property Inbox.
  if (path.startsWith(`${base}/inbox`) || path.startsWith(`${base}/guest-chat`)) return SECTION_LABELS.inbox;
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
  canReplyGuests,
}: {
  propertyId: string;
  propertyName: string;
  canEditProperty: boolean;
  canReplyGuests: boolean;
}) {
  const pathname = usePathname();
  const sections = propertySections(propertyId, canEditProperty, canReplyGuests);
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
            const Icon = SECTION_ICONS[section.key];
            return (
              <Link
                key={section.key}
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={`property-workspace-nav-link${active ? ' is-active' : ''}`}
              >
                <span className="property-workspace-nav-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <span>{section.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {/* All rail + breadcrumb styling lives in globals.css. styled-jsx is not
          wired up in this App Router build, so the scoped <style jsx> block
          that used to sit here never applied and the rail rendered unstyled. */}
    </>
  );
}
