// Centralized environment access with dev-fallback awareness.
// Server-only secrets are read lazily and never bundled into client code.

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1';
}

export const publicEnv = {
  appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
};

// Server-only. Accessing these on the client returns undefined by design.
export const serverEnv = {
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  guestContactSalt: process.env.GUEST_CONTACT_SALT ?? 'dev-salt-change-me',
  guestVerifyDevFallback: bool(process.env.GUEST_VERIFY_DEV_FALLBACK, false),
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? '',

  aiDevFallback: bool(process.env.AI_DEV_FALLBACK, false),
  aiApiKey: process.env.AI_API_KEY ?? '',
  aiBaseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
  aiEmbedModel: process.env.AI_EMBED_MODEL ?? 'text-embedding-3-small',
  aiChatModel: process.env.AI_CHAT_MODEL ?? 'gpt-4o-mini',

  ingestionDevFallback: bool(process.env.INGESTION_DEV_FALLBACK, false),
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  firecrawlBaseUrl: process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev',
    resendApiKey: process.env.RESEND_API_KEY ?? '', // Server-only. Email delivery via Resend.

  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePrices: {
    starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
    starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    growth_monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? '',
    growth_annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? '',
    portfolio_monthly: process.env.STRIPE_PRICE_PORTFOLIO_MONTHLY ?? '',
    portfolio_annual: process.env.STRIPE_PRICE_PORTFOLIO_ANNUAL ?? '',
  },
};

export function hasServiceRole(): boolean {
  return serverEnv.serviceRoleKey.length > 0;
}
