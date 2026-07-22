// Single source of truth for the subprocessor register. BOTH the public
// /legal/subprocessors table and the /legal/dpa Schedule read from this list,
// so there is one authoritative record of who processes what, where.
//
// ACCURACY RULE (see LEGAL_COMPLIANCE_SPEC "REALITY CHECK"): only mark a vendor
// `active: true` if it is actually wired in the codebase today. OpenRouter is
// DORMANT (code path exists, no API key set) and is marked active: false.

export interface Subprocessor {
  vendor: string;
  purpose: string;
  dataProcessed: string;
  region: string;
  /** Public DPA / privacy URL for the vendor. */
  dpaUrl: string;
  /** Transfer safeguard for data leaving the EU/UK. */
  transferMechanism: string;
  retention: string;
  /** True only if the integration is live in code with credentials configured. */
  active: boolean;
  /** Shown when active === false to explain the conditional status. */
  note?: string;
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    vendor: 'Supabase',
    purpose: 'Primary application database (Postgres + pgvector), authentication, file storage',
    dataProcessed: 'Host account & profile data, property/brain content, guest identities (hashed contacts), embeddings',
    region: 'EU (Frankfurt) / US — project-dependent',
    dpaUrl: 'https://supabase.com/legal/dpa',
    transferMechanism: 'SCCs',
    retention: 'For the life of the account; deleted on erasure request (billing/legal records retained)',
    active: true,
  },
  {
    vendor: 'Vercel',
    purpose: 'Application hosting, edge network, serverless compute',
    dataProcessed: 'Request metadata, IP addresses, logs',
    region: 'US / global edge',
    dpaUrl: 'https://vercel.com/legal/dpa',
    transferMechanism: 'SCCs',
    retention: 'Transient; logs per Vercel retention policy',
    active: true,
  },
  {
    vendor: 'Stripe',
    purpose: 'Payment processing and subscription billing',
    dataProcessed: 'Host billing contact, payment card data (held by Stripe, never by us), invoices',
    region: 'US / EU',
    dpaUrl: 'https://stripe.com/legal/dpa',
    transferMechanism: 'SCCs',
    retention: 'Per Stripe policy and tax/accounting law (typically 7+ years for financial records)',
    active: true,
  },
  {
    vendor: 'OpenAI',
    purpose: 'Primary AI subprocessor — chat completions and text embeddings (text-embedding-3-small)',
    dataProcessed: 'Guest questions and property knowledge context (PII redacted before external routing where applicable)',
    region: 'US',
    dpaUrl: 'https://openai.com/policies/data-processing-addendum',
    transferMechanism: 'SCCs',
    retention: 'API inputs/outputs retained up to 30 days for abuse monitoring, then deleted (no training on API data)',
    active: true,
  },
  {
    vendor: 'OpenRouter',
    purpose: 'Optional/conditional AI model router (failover / model diversity)',
    dataProcessed: 'Redacted prompt content only, when enabled',
    region: 'US',
    dpaUrl: 'https://openrouter.ai/privacy',
    transferMechanism: 'SCCs',
    retention: 'Zero-Data-Retention requested when the external path is enabled',
    active: false,
    note: 'Conditional / optional — NOT currently active. No API key configured; all AI traffic routes to OpenAI today.',
  },
  {
    vendor: 'Resend',
    purpose: 'Transactional email delivery (host notifications, escalations)',
    dataProcessed: 'Host email address, notification content',
    region: 'US',
    dpaUrl: 'https://resend.com/legal/dpa',
    transferMechanism: 'SCCs',
    retention: 'Delivery logs per Resend policy',
    active: true,
  },
  {
    vendor: 'Twilio',
    purpose: 'SMS delivery for guest verification one-time codes',
    dataProcessed: 'Guest phone number, one-time verification code',
    region: 'US / global',
    dpaUrl: 'https://www.twilio.com/legal/data-protection-addendum',
    transferMechanism: 'SCCs',
    retention: 'Message logs per Twilio policy',
    active: true,
  },
  {
    vendor: 'Firecrawl',
    purpose: 'Host-initiated URL ingestion (fetch & extract public listing/content pages)',
    dataProcessed: 'URLs submitted by the host and the fetched page content',
    region: 'US',
    dpaUrl: 'https://www.firecrawl.dev/privacy-policy',
    transferMechanism: 'SCCs',
    retention: 'Transient; extracted content stored in the host’s Property Brain',
    active: true,
  },
  {
    vendor: 'Sentry',
    purpose: 'Application error monitoring and performance tracing',
    dataProcessed: 'Error events, stack traces, request metadata (PII scrubbed where feasible)',
    region: 'US / EU',
    dpaUrl: 'https://sentry.io/legal/dpa/',
    transferMechanism: 'SCCs',
    retention: 'Per Sentry retention settings (typically 90 days)',
    active: true,
  },
  {
    vendor: 'Cloudflare',
    purpose: 'Bot mitigation (Turnstile) on guest verification and edge protection',
    dataProcessed: 'IP address, challenge token, request metadata',
    region: 'Global edge',
    dpaUrl: 'https://www.cloudflare.com/cloudflare-customer-dpa/',
    transferMechanism: 'SCCs',
    retention: 'Transient challenge data',
    active: true,
  },
  {
    vendor: 'PostHog',
    purpose: 'Product analytics (host-side usage; no guest PII sent)',
    dataProcessed: 'Pseudonymous host user id, product events, page views',
    region: 'US / EU (cloud region dependent)',
    dpaUrl: 'https://posthog.com/dpa',
    transferMechanism: 'SCCs',
    retention: 'Per PostHog project retention settings',
    active: true,
  },
];
