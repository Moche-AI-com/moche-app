// Dashboard breadcrumbs (backlog P6-06).
//
// Pure path -> trail logic so the labelling and the "which crumbs are links"
// rules are tested directly; the component only renders what this returns.

export interface Crumb {
  label: string;
  /** null on the final crumb, which is the current page and not a link. */
  href: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Labels for known dashboard segments. Anything missing falls back to a
 * title-cased version of the segment, so a new route still renders a sane trail
 * before anyone remembers to add it here.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Home',
  properties: 'Properties',
  new: 'Add property',
  brain: 'Brain',
  extras: 'Enhancements',
  details: 'Personal details',
  security: 'Security and sign-in',
  usage: 'Usage',
  access: 'Properties and access',
  legal: 'Legal and agreements',
  privacy: 'Data and privacy',
  support: 'Support',
  local: 'Local',
  nearby: 'Nearby places',
  recommendations: 'Recommendations',
  settings: 'Settings',
  stays: 'Stays',
  'welcome-card': 'Welcome card',
  escalations: 'Escalations',
  'service-requests': 'Service requests',
  'service-request': 'Service report',
  reports: 'Reports',
  notifications: 'Notifications',
  updates: 'Suggested updates',
  profile: 'Profile',
  billing: 'Billing',
};

function titleCase(segment: string): string {
  const words = segment.replace(/[-_]+/g, ' ').trim();
  if (!words) return segment;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment] ?? titleCase(segment);
}

export interface BreadcrumbOptions {
  /**
   * id -> display name, used to label id segments with something a host
   * recognises instead of a raw uuid.
   */
  names?: Record<string, string>;
}

/**
 * Builds the trail for a dashboard pathname.
 *
 * Returns an empty array for the dashboard root: a single "Home" crumb on the
 * home page is noise, and the acceptance criterion only asks for breadcrumbs on
 * non-top-level pages.
 *
 * Every crumb except the last is a link, and each href is the literal ancestor
 * path, so a deep link works on its own with no dependence on how the guest got
 * there.
 */
export function buildBreadcrumbs(pathname: string, options: BreadcrumbOptions = {}): Crumb[] {
  const clean = (pathname || '').split(/[?#]/)[0];
  const segments = clean.split('/').filter(Boolean);
  if (segments[0] !== 'dashboard') return [];
  if (segments.length <= 1) return [];

  const crumbs: Crumb[] = [];
  let href = '';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    href += `/${segment}`;
    const isLast = i === segments.length - 1;

    let label: string;
    if (UUID_RE.test(segment)) {
      // An id on its own means nothing to a host. Prefer the resolved name, and
      // fall back to the parent's singular label rather than showing a uuid.
      label = options.names?.[segment] ?? fallbackIdLabel(segments[i - 1]);
    } else {
      label = segmentLabel(segment);
    }

    crumbs.push({ label, href: isLast ? null : href });
  }

  return crumbs;
}

function fallbackIdLabel(parent: string | undefined): string {
  switch (parent) {
    case 'properties': return 'Property';
    case 'escalations': return 'Escalation';
    case 'service-request': return 'Report';
    default: return 'Details';
  }
}

/** True when a pathname should render a trail at all. */
export function hasBreadcrumbs(pathname: string): boolean {
  return buildBreadcrumbs(pathname).length > 0;
}
