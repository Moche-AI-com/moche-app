// Centralized environment access with dev-fallback awareness.
// Server-only secrets are read lazily and never bundled into client code.

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1';
}

// A Supabase full-privilege credential is either a legacy service_role JWT (`eyJ...`) or a
// modern secret key (`sb_secret_...`). Anything else is a misconfiguration, not a credential.
function looksLikeSupabaseSecret(v: string | undefined): boolean {
  if (!v) return false;
  return v.startsWith('eyJ') || v.startsWith('sb_secret_');
}

function resolveServiceRoleKey(): string {
  const primary = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (looksLikeSupabaseSecret(primary)) return primary!;
  const integration = process.env.SUPABASE_SECRET_KEY;
  if (looksLikeSupabaseSecret(integration)) return integration!;
  return '';
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
  // Accepts either name. The Vercel<->Supabase integration provisions SUPABASE_SECRET_KEY
  // (the modern `sb_secret_...` format), while hand-configured deploys use the legacy
  // SUPABASE_SERVICE_ROLE_KEY JWT. Both are full-privilege, RLS-bypassing credentials and
  // are interchangeable as a bearer token, so read whichever is actually populated instead
  // of failing closed when only the integration-managed one is set.
  //
  // The fallback is format-guarded on purpose. SUPABASE_SECRET_KEY is a generic-sounding
  // name that is easy to misfill with an unrelated vendor secret; silently sending a
  // Stripe or Resend key to Supabase as a bearer token would surface as opaque 401s from
  // every admin-client call. Requiring the credential to actually look like a Supabase
  // secret turns that misconfiguration into a clean "no service role" state instead.
  serviceRoleKey: resolveServiceRoleKey(),
  guestContactSalt: process.env.GUEST_CONTACT_SALT ?? 'dev-salt-change-me',
  guestVerifyDevFallback: bool(process.env.GUEST_VERIFY_DEV_FALLBACK, false),
  turnstileSecret: process.env.TURNSTILE_SECRET_KEY ?? '',

  aiDevFallback: bool(process.env.AI_DEV_FALLBACK, false),
  aiApiKey: process.env.AI_API_KEY ?? '',
  // Defaults point at OpenRouter, not a provider directly. Rationale: an unset
  // AI_BASE_URL previously fell through to api.openai.com with a bare `gpt-4o-mini`,
  // which silently bypassed the router — the cause of the untracked OpenAI spend seen
  // in ai_usage before 2026-08-04. Defaulting to the router makes a missing env var a
  // routing no-op instead of a policy violation.
  aiBaseUrl: process.env.AI_BASE_URL ?? 'https://openrouter.ai/api/v1',
  aiChatModel: process.env.AI_CHAT_MODEL ?? 'google/gemini-2.5-flash',

  // Embeddings need their own base URL + key because OpenRouter is a chat-completions
  // router and does not expose an /embeddings endpoint. Chat goes to the router;
  // embeddings go straight to the embedding provider. Both default sensibly, and both
  // fall back to the shared AI_* values so existing single-provider setups keep working.
  aiEmbedBaseUrl: process.env.AI_EMBED_BASE_URL ?? process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
  aiEmbedApiKey: process.env.AI_EMBED_API_KEY ?? process.env.AI_API_KEY ?? '',
  aiEmbedModel: process.env.AI_EMBED_MODEL ?? 'text-embedding-3-small',

  // Dev-only local model provider (PR #5). 'ollama' routes getAIProvider() to a local
  // Ollama instance instead of OpenAI/dev-fallback. Ignored in production regardless of
  // value — isProductionRuntime() always wins in lib/ai/index.ts, so this can never
  // select Ollama on a real deploy even if someone sets it by mistake.
  aiDevProvider: process.env.AI_DEV_PROVIDER ?? '',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? 'llama3.1',
  // No local Ollama embed model ships at the locked EMBED_DIM (1536) out of the box
  // (nomic-embed-text=768, mxbai-embed-large=1024). embed() will throw a clear error
  // unless OLLAMA_EMBED_MODEL is pointed at a model/adapter that actually emits 1536
  // dims. Chat/generate is unaffected — this only gates embed().
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text',

  // OpenRouter model-routing toggle. OFF by default: with no key set, routedCompletion()
  // uses the existing OpenAI provider and behaves identically to today. When a key is
  // present, eligible tasks are routed to OpenRouter (PII redacted before the external call).
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
  // Legacy/default model slug. Still honored as the fallback default for any tier that
  // does not have its own override set below (keeps existing single-model config working).
  // Defaults to Gemini 2.5 Flash, not gpt-4o-mini: the approved routing policy is
  // Gemini 2.5 Flash -> Claude Haiku, and an unset var should land on policy.
  openrouterModel: process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash',
  openrouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',

  // Per-tier model slugs. Each task type maps to a cost/quality-appropriate model.
  // Extraction & general use a cheap, reliable small model; classification uses an
  // open-weight Llama; concierge (guest-facing) uses a stronger model but is gated OFF.
  openrouterModelExtraction:
    process.env.OPENROUTER_MODEL_EXTRACTION ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
  openrouterModelClassification:
    process.env.OPENROUTER_MODEL_CLASSIFICATION ?? 'meta-llama/llama-3.1-8b-instruct',
  // Gemini 2.5 Flash: verified available under our Zero-Data-Retention provider
  // restriction, ~2.7x cheaper per answer than claude-haiku-4.5 ($0.30/$2.50 per M
  // tokens vs $1.00/$5.00) at comparable grounded-chat quality. Chosen to keep the
  // guest-facing path affordable within the account's monthly credit cap.
  openrouterModelConcierge:
    process.env.OPENROUTER_MODEL_CONCIERGE ?? 'google/gemini-2.5-flash',
  openrouterModelGeneral:
    process.env.OPENROUTER_MODEL_GENERAL ?? process.env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',

  // Concierge (guest-facing) external routing is OFF by default even when an
  // OPENROUTER_API_KEY is present: guest answers stay on the in-house OpenAI provider
  // unless this is explicitly enabled. Extraction/classification/general may route as
  // soon as a key is set.
  openrouterConciergeEnabled: bool(process.env.OPENROUTER_CONCIERGE_ENABLED, false),

  ingestionDevFallback: bool(process.env.INGESTION_DEV_FALLBACK, false),
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  firecrawlBaseUrl: process.env.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev',

  resendApiKey: process.env.RESEND_API_KEY ?? '', // Server-only. Email delivery via Resend.

  // Internal business inbox that receives product-feedback pings (host feedback
  // submissions) for follow-up. Server-only. Override via FEEDBACK_INBOX in Vercel.
  feedbackInbox: process.env.FEEDBACK_INBOX ?? 'hostspark.org@gmail.com',

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
  // One entry per plan id + interval. Keys are `${planId}_${interval}` so
  // lib/billing/stripe.ts can resolve them without string surgery. The two
  // sales-assisted tiers have no standing price: a price is created per contract
  // and pasted into the env var, so both are allowed to stay empty.
  //
  // GROWTH was renamed to GROWTH_LOWER. The old STRIPE_PRICE_GROWTH_* names are
  // still read as a fallback so an existing deployment does not lose its mapping
  // between this deploy and the env var rename.
  stripePrices: {
    starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
    starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL ?? '',
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
    growth_lower_monthly:
      process.env.STRIPE_PRICE_GROWTH_LOWER_MONTHLY ?? process.env.STRIPE_PRICE_GROWTH_MONTHLY ?? '',
    growth_lower_annual:
      process.env.STRIPE_PRICE_GROWTH_LOWER_ANNUAL ?? process.env.STRIPE_PRICE_GROWTH_ANNUAL ?? '',
    growth_upper_monthly: process.env.STRIPE_PRICE_GROWTH_UPPER_MONTHLY ?? '',
    growth_upper_annual: process.env.STRIPE_PRICE_GROWTH_UPPER_ANNUAL ?? '',
    portfolio_monthly: process.env.STRIPE_PRICE_PORTFOLIO_MONTHLY ?? '',
    portfolio_annual: process.env.STRIPE_PRICE_PORTFOLIO_ANNUAL ?? '',
    enterprise_monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
    enterprise_annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL ?? '',
    custom_monthly: process.env.STRIPE_PRICE_CUSTOM_MONTHLY ?? '',
    custom_annual: process.env.STRIPE_PRICE_CUSTOM_ANNUAL ?? '',
  },
  // STRIPE_PRICE_ACTIVATION was removed alongside the activation-fee constants in
  // lib/constants.ts. There is no setup fee, so there is no one-time price to read.

  // AWS S3 — private object storage. Presigned PUT/GET only; bytes never transit
  // the app server. SERVER ONLY. Never prefix with NEXT_PUBLIC_.
  awsRegion: process.env.AWS_REGION ?? 'us-east-2',
  s3Bucket: process.env.S3_BUCKET ?? '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
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
