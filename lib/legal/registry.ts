// Single source of truth for legal document metadata. Bumping a clickwrap version
// requires existing hosts to re-accept it; publish legal changes deliberately.
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
  navLabel: string;
  version: string;
  lastUpdated: string;
  summary: string;
}

export const LEGAL_DOCS: LegalDocMeta[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    navLabel: 'Terms of Service',
    version: 'v1.3.0',
    lastUpdated: '2026-09-24',
    summary: 'The agreement governing host use, including AI limits, subscriptions, founding discount eligibility, SMS messaging, and liability.',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    navLabel: 'Privacy Policy',
    version: 'v1.2.0',
    lastUpdated: '2026-08-04',
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
    version: 'v1.1.0',
    lastUpdated: '2026-08-04',
    summary: 'GDPR Article 28 processing terms, technical & organizational measures, and subprocessors.',
  },
  {
    slug: 'msa',
    title: 'Master Service Agreement',
    navLabel: 'Master Service Agreement',
    version: 'v1.1.0',
    lastUpdated: '2026-08-04',
    summary: 'Enterprise agreement template — liability caps and governing law mirror the Terms of Service.',
  },
  {
    slug: 'security',
    title: 'Security Overview',
    navLabel: 'Security',
    version: 'v1.1.0',
    lastUpdated: '2026-08-04',
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
    version: 'v1.2.0',
    lastUpdated: '2026-08-04',
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

export const CURRENT_VERSIONS: Record<LegalSlug, string> = LEGAL_DOCS.reduce(
  (acc, d) => {
    acc[d.slug] = d.version;
    return acc;
  },
  {} as Record<LegalSlug, string>,
);

export const CLICKWRAP_SLUGS: LegalSlug[] = ['terms', 'privacy', 'acceptable-use'];
