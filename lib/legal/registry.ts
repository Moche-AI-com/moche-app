// Single source of truth for legal document metadata (slug, title, version,
// last-updated date). The legal layout reads from here so every page's version
// string and "Last Updated" date live in ONE place, and the re-acceptance gate
// compares a user's accepted version against CURRENT_VERSIONS below.
//
// When publishing a new version: bump `version` + `lastUpdated` here, then insert
// the matching row into the `legal_documents` table (see supabase-migrations-LEGAL.sql)
// so the DB-backed re-acceptance flow picks it up.

export type LegalSlug =
  | 'terms'
  | 'privacy'
  | 'refund'
  | 'dpa'
  | 'msa'
  | 'security'
  | 'subprocessors'
  | 'acceptable-use'
  | 'ai-policy'
  | 'open-source'
  | 'cookies'
  | 'support';

export interface LegalDocMeta {
  slug: LegalSlug;
  title: string;
  /** Short label for the TOC sidebar. */
  navLabel: string;
  version: string;
  /** ISO date (YYYY-MM-DD) shown as "Last Updated". */
  lastUpdated: string;
  /** One-line summary used in the index page and <meta description>. */
  summary: string;
}

// Order here drives the TOC sidebar and the legal-center index ordering.
export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    navLabel: 'Terms of Service',
    version: 'v1.1.0',
    lastUpdated: '2026-07-27',
    summary: 'The agreement governing host use of Moche.AI, including AI-output disclaimers, SMS/WhatsApp messaging terms, and liability limits.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    navLabel: 'Privacy Policy',
    version: 'v1.1.0',
    lastUpdated: '2026-07-27',
    summary: 'How we collect, use, and protect personal data under GDPR, UK GDPR, and CCPA/CPRA, including SMS/WhatsApp opt-in data.',
  },
  {
    slug: 'refund',
    title: 'Refund & Billing Policy',
    navLabel: 'Refund & Billing',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'Subscription billing, cancellation, refunds, dunning, and chargeback handling.',
  },
  {
    slug: 'dpa',
    title: 'Data Processing Addendum',
    navLabel: 'Data Processing Addendum',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'GDPR Article 28 processing terms, technical & organizational measures, and subprocessors.',
  },
  {
    slug: 'msa',
    title: 'Master Service Agreement',
    navLabel: 'Master Service Agreement',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'Enterprise agreement template — liability caps and governing law mirror the Terms of Service.',
  },
  {
    slug: 'security',
    title: 'Security Overview',
    navLabel: 'Security',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'Our security controls, grouped by ISO 27001 / SOC 2 control families (aligned with, not certified).',
  },
  {
    slug: 'subprocessors',
    title: 'Subprocessors',
    navLabel: 'Subprocessors',
    version: 'v1.3.0',
    lastUpdated: '2026-08-03',
    summary: 'The third-party services that process data on our behalf, their purpose, region, and safeguards.',
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    navLabel: 'Acceptable Use',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'Prohibited uses of the platform, including flowed-down model provider restrictions.',
  },
  {
    slug: 'ai-policy',
    title: 'AI Disclosure & Use Policy',
    navLabel: 'AI Policy',
    version: 'v1.1.0',
    lastUpdated: '2026-07-27',
    summary:
      'How the AI concierge works, which models answer guests, its limits, the redaction and zero-data-retention safeguards applied before content leaves our infrastructure, and when it refuses or escalates to a human host.',
  },
  {
    slug: 'open-source',
    title: 'Open-Source & Model Attributions',
    navLabel: 'Open-Source Notices',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'Open-source and AI-model attributions and license notices.',
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    navLabel: 'Cookies',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'The cookies and trackers we use and how consent is handled in the EU/UK.',
  },
  {
    slug: 'support',
    title: 'Support & Data Rights',
    navLabel: 'Support & Data Rights',
    version: 'v1.0.0',
    lastUpdated: '2026-07-22',
    summary: 'How to get help, our response targets, and how to exercise your data rights.',
  },
];

const BY_SLUG: Record<LegalSlug, LegalDocMeta> = LEGAL_DOCS.reduce(
  (acc, d) => {
    acc[d.slug] = d;
    return acc;
  },
  {} as Record<LegalSlug, LegalDocMeta>,
);

export function getLegalDoc(slug: LegalSlug): LegalDocMeta {
  return BY_SLUG[slug];
}

// Current published version per slug — the re-acceptance gate compares a user's
// last accepted version to this. Kept in sync with LEGAL_DOCS above.
export const CURRENT_VERSIONS: Record<LegalSlug, string> = LEGAL_DOCS.reduce(
  (acc, d) => {
    acc[d.slug] = d.version;
    return acc;
  },
  {} as Record<LegalSlug, string>,
);

// The documents a host must (re)accept via clickwrap. Guests get the in-portal
// AI disclosure instead; these are the host-facing agreements. The Acceptable Use
// Policy is included so we have explicit, auditable consent to the usage rules we
// enforce (incl. the flowed-down Llama 3 AUP) before an account can be created.
export const CLICKWRAP_SLUGS: LegalSlug[] = ['terms', 'privacy', 'acceptable-use'];
