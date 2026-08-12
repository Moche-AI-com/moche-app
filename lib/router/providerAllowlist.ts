import 'server-only';

// Directive §0.2 row 3 ("OpenRouter routine-guest model allowlist + ordered fallback")
// and §1 (corrected provider-routing syntax).
//
// Two independent allowlists are enforced here, and they answer different questions:
//
//   1. MODEL allowlist  — which OpenRouter model slugs may serve a *routine guest*
//      answer. This exists because a guest-facing answer is the highest-blast-radius
//      route in the product: an unreviewed model that hallucinates a door code or a
//      checkout time is a support incident, not a quality regression. Routing may
//      only ever pick from an ordered list a human reviewed.
//
//   2. PROVIDER allowlist — which upstream inference providers OpenRouter is allowed
//      to dispatch to. `zdr: true` + `data_collection: 'deny'` already filter to
//      zero-retention endpoints, but those flags reflect OpenRouter's best knowledge
//      of third-party policy (their own docs say so). Pinning `provider.only` is the
//      belt to that suspenders: if OpenRouter's classification of a provider changes,
//      we do not silently start sending guest text somewhere we never reviewed.
//
// Both fail CLOSED. An empty or unparseable model allowlist yields
// `provider_ineligible` rather than a permissive default, which is the safe-default
// behavior §0.2 row 3 declared binding until an allowlist was supplied.

// Model slugs reviewed for the routine-guest route. A slug may appear in the live
// allowlist only if it also appears here, so an env typo or a copy-pasted slug from
// somewhere else can widen availability but never bypass review.
//
// Order is the reviewed preference order: cheapest capable model first, with a
// different vendor family second so a single vendor outage does not take the route
// down. Every slug is verified to resolve under the ZDR provider block below.
export const REVIEWED_GUEST_MODELS: readonly string[] = [
  'google/gemini-2.5-flash',
  'openai/gpt-4o-mini',
  'anthropic/claude-haiku-4.5',
];

// Upstream provider slugs reviewed as zero-retention for guest traffic. Slugs are the
// base form, which matches every region/variant endpoint of that provider (OpenRouter
// provider-routing docs). Service-tier endpoints (e.g. `openai/priority`) are NOT
// matched by a base slug and are therefore out of scope by construction.
export const REVIEWED_ZERO_RETENTION_PROVIDERS: readonly string[] = [
  'azure',
  'google-vertex',
  'openai',
  'anthropic',
];

// Raised when routing cannot name a single reviewed model for the requested route.
// The `code` is stable because it is logged and asserted on; the message is not.
export class ProviderIneligibleError extends Error {
  readonly code = 'provider_ineligible' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ProviderIneligibleError';
  }
}

// Parse a comma-separated env allowlist. Tolerant of whitespace, empty entries, and
// duplicates; case-normalized because OpenRouter slugs are lowercase.
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export interface AllowlistEnv {
  openrouterGuestModelAllowlist: string;
  openrouterProviderAllowlist: string;
}

// Ordered model chain for the routine-guest route.
//
// Env order wins (that is how an operator expresses preference without a deploy), but
// every entry must survive the REVIEWED_GUEST_MODELS intersection. Throws
// ProviderIneligibleError when nothing survives — callers must not substitute a
// default, because "pick something reasonable" is exactly the drift this prevents.
export function routineGuestModelChain(env: AllowlistEnv): string[] {
  const requested = parseAllowlist(env.openrouterGuestModelAllowlist);
  const reviewed = new Set(REVIEWED_GUEST_MODELS);
  const chain = requested.filter((slug) => reviewed.has(slug));
  if (chain.length === 0) {
    throw new ProviderIneligibleError(
      requested.length === 0
        ? 'routine-guest model allowlist is empty; external routing is ineligible'
        : `no requested routine-guest model is reviewed: ${requested.join(', ')}`,
    );
  }
  return chain;
}

// Provider slugs to pin on the request, or undefined to leave provider selection to
// the zdr/data_collection filters alone. Unreviewed slugs are dropped rather than
// erroring: a narrower-than-requested provider set is safe, a wider one is not.
export function allowedProviderSlugs(env: AllowlistEnv): string[] | undefined {
  const requested = parseAllowlist(env.openrouterProviderAllowlist);
  if (requested.length === 0) return undefined;
  const reviewed = new Set(REVIEWED_ZERO_RETENTION_PROVIDERS);
  const allowed = requested.filter((slug) => reviewed.has(slug));
  return allowed.length > 0 ? allowed : undefined;
}

// The provider block from directive §1, verbatim in field names and values.
//
// `sort.partition: 'model'` is the correction the directive calls out: it groups
// endpoints by model before sorting, so the primary (reviewed) model's endpoints are
// always tried first and routing cannot drift onto a cheaper unreviewed alternative.
// `partition: 'none'` would sort globally across the `models` array and defeat that.
//
// `allow_fallbacks: true` is safe here only because `zdr` + `data_collection` (and,
// when configured, `only`) constrain what a fallback can be: a fallback is another
// zero-retention endpoint for a reviewed model, never a different model.
export const PROVIDER_ROUTING_POLICY = {
  require_parameters: true,
  zdr: true,
  data_collection: 'deny',
  allow_fallbacks: true,
  sort: { by: 'latency', partition: 'model' },
} as const;

export type ProviderBlock = typeof PROVIDER_ROUTING_POLICY & { only?: string[] };

export function providerBlock(env: AllowlistEnv): ProviderBlock {
  const only = allowedProviderSlugs(env);
  return only ? { ...PROVIDER_ROUTING_POLICY, only } : { ...PROVIDER_ROUTING_POLICY };
}
