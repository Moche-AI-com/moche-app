// Single source of truth for the subprocessor register. BOTH the public
// /legal/subprocessors table and the /legal/dpa Schedule read from this list,
// so there is one authoritative record of who processes what, where.
//
// ACCURACY RULE (see LEGAL_COMPLIANCE_SPEC "REALITY CHECK"): only mark a vendor
// `active: true` if it is actually wired in the codebase today. OpenRouter became
// ACTIVE once an API key was configured in production and model routing (including
// the guest-facing concierge tier) was enabled.

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
    purpose:
      'AI subprocessor — text embeddings (text-embedding-3-small), guest-intent classification, and the fallback path for all chat completions if model routing is unavailable',
    dataProcessed: 'Guest questions and property knowledge context (PII redacted before external routing where applicable)',
    region: 'US',
    dpaUrl: 'https://openai.com/policies/data-processing-addendum',
    transferMechanism: 'SCCs',
    retention: 'API inputs/outputs retained up to 30 days for abuse monitoring, then deleted (no training on API data)',
    active: true,
  },
  {
    vendor: 'OpenRouter',
    purpose:
      'AI model router — directs completion requests to a task-appropriate model (currently Google Gemini 2.5 Flash for guest answers, OpenAI GPT-4o-mini and Meta Llama 3.1 for background extraction/classification) with automatic failover between models',
    dataProcessed:
      'Prompt content only, with personal data programmatically redacted before the request leaves our infrastructure: guest questions and the relevant property knowledge context. A post-redaction check blocks the external request entirely if personal data is still detected. No guest identity, contact details, or account data are sent.',
    region: 'US (routes to model providers in the US/EU)',
    dpaUrl: 'https://openrouter.ai/privacy',
    transferMechanism: 'SCCs',
    retention:
      'Zero-Data-Retention enforced on every request: prompts and responses are not logged or retained by OpenRouter, and any downstream model provider that would collect or train on the data is refused (the request fails closed and falls back to our primary provider instead)',
    active: true,
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
    vendor: 'Mapbox',
    purpose:
      'Address autocomplete/geocoding, nearby place discovery, and static map images on the host dashboard',
    dataProcessed:
      'Property address strings and coordinates entered by the host, plus the host browser’s request metadata (IP, referrer) when a static map image loads. No guest identity or guest message content is sent.',
    region: 'US',
    dpaUrl: 'https://www.mapbox.com/legal/dpa',
    transferMechanism: 'SCCs',
    retention: 'Query logs per Mapbox policy; results cached in the host’s own property records',
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
  {
    vendor: 'Trigger.dev',
    purpose: 'Background job orchestration (async task execution and retries outside the request/response cycle)',
    dataProcessed:
      'Task payloads we choose to send. Jobs are designed to carry row/record ids only, never guest PII directly — the job re-reads any needed data from Supabase using the service role at execution time.',
    region: 'US',
    dpaUrl: 'https://trigger.dev/legal/privacy',
    transferMechanism: 'SCCs',
    retention: 'Run logs and payloads retained per Trigger.dev account settings',
    active: true,
  },
  {
    vendor: 'Amazon Web Services (S3)',
    purpose:
      'Private object storage for host-uploaded files and images, accessed only via short-lived presigned URLs so bytes never transit our app servers',
    dataProcessed:
      'Property-related images and documents the host uploads. Objects are stored under a per-property key prefix; no object is publicly accessible (all public access blocked, TLS-only bucket policy, server-side encryption at rest).',
    region: 'US (us-east-2)',
    dpaUrl: 'https://aws.amazon.com/service-terms/',
    transferMechanism: 'SCCs',
    retention: 'Objects retained until deleted by the host or removed per bucket lifecycle policy (noncurrent versions expire after 90 days)',
    active: true,
  },
];
