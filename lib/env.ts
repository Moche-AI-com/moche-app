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
  // Public-safe observability keys only. Secret DSN/keys stay server-side below.
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
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

  // Twilio — SMS delivery. SERVER ONLY. Never prefix with NEXT_PUBLIC_.
  // Dual auth: prefer API Key SID/Secret (revocable), fall back to Account Auth Token.
  // Legacy aliases TWILIO_API_KEY / TWILIO_API_SECRET are accepted so existing Vercel env works.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioApiKeySid: process.env.TWILIO_API_KEY_SID ?? process.env.TWILIO_API_KEY ?? '',
  twilioApiKeySecret: process.env.TWILIO_API_KEY_SECRET ?? process.env.TWILIO_API_SECRET ?? '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? process.env.TWILIO_PHONE_NUMBER ?? '',

  // Host SMS fan-out master switch (default OFF — see notify() consent TODO before enabling in prod).
  notifySmsEnabled: bool(process.env.NOTIFY_SMS_ENABLED, false),

  // Publish gates. Default OFF so a property with required fields alone can go live —
  // this makes demoing/testing frictionless (Brain/knowledge can be added later).
  // Set both to true in production billing mode to require a paid plan + core Brain before publishing.
  requirePlanToPublish: bool(process.env.REQUIRE_PLAN_TO_PUBLISH, false),
  requireBrainToPublish: bool(process.env.REQUIRE_BRAIN_TO_PUBLISH, false),

  // Observability (server-only secrets).
  sentryDsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  sentryAuthToken: process.env.SENTRY_AUTH_TOKEN ?? '',
  posthogServerKey: process.env.POSTHOG_KEY ?? '',
  posthogServerHost: process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',

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

// True only when running as a real production deployment (both signals agree).
// Used for fail-safe decisions (Turnstile, AI fallback) that must never soft-open in prod.
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production';
}

// --- Twilio auth resolution ---------------------------------------------
// Resolution order (see spec §6-F):
//   1. API Key SID + Secret present → Basic base64(API_KEY_SID:API_KEY_SECRET), Account SID in URL path.
//   2. else Auth Token present     → Basic base64(ACCOUNT_SID:AUTH_TOKEN).
//   3. else SMS disabled (null).
// A usable From number (TWILIO_FROM_NUMBER or TWILIO_PHONE_NUMBER) and Account SID are always required.
export interface TwilioAuth {
  accountSid: string;
  authHeader: string; // base64 credentials for the Basic auth header
  fromNumber: string;
  mode: 'api_key' | 'auth_token';
}

type TwilioEnvSlice = Pick<
  typeof serverEnv,
  'twilioAccountSid' | 'twilioAuthToken' | 'twilioApiKeySid' | 'twilioApiKeySecret' | 'twilioFromNumber'
>;

export function resolveTwilioAuth(env: TwilioEnvSlice = serverEnv): TwilioAuth | null {
  const { twilioAccountSid, twilioAuthToken, twilioApiKeySid, twilioApiKeySecret, twilioFromNumber } = env;
  if (!twilioAccountSid || !twilioFromNumber) return null;

  if (twilioApiKeySid && twilioApiKeySecret) {
    return {
      accountSid: twilioAccountSid,
      authHeader: Buffer.from(`${twilioApiKeySid}:${twilioApiKeySecret}`).toString('base64'),
      fromNumber: twilioFromNumber,
      mode: 'api_key',
    };
  }
  if (twilioAuthToken) {
    return {
      accountSid: twilioAccountSid,
      authHeader: Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64'),
      fromNumber: twilioFromNumber,
      mode: 'auth_token',
    };
  }
  return null;
}
