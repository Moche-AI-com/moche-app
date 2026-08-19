# OpenRouter Tiered Model Routing — Build Spec (v2)

> Enhanced from v1 using the model-analysis findings.  
> Key alignment: **one cheap router/classifier, task-level routing only, no per-field fan-out, host-side PII redaction, zero-retention external calls, concierge stays in-house by default.**

## Goal

Extend the existing single-model OpenRouter POC in `lib/router/modelRouter.ts` into a **tiered** router that picks a cheaper or higher-quality model per task type, to reduce cost while preserving compliance (PII redaction + ZDR) and guest UX quality.

This is an **extension** of existing code — do **not** rewrite from scratch. Do **not** make destructive changes. Keep the default-OFF behavior when no `OPENROUTER_API_KEY` is set.

The router remains **task-level**, not field-level. It does not introduce per-field agents, fan-out, or LLM normalization. Those remain outside this spec.

## Design alignment with model analysis

- **Classification/routing = cheap tier.** `classification` maps to Llama 3.1 8B. This is the cheap-router principle: relevance/classification should not consume GPT-4o-class tokens.
- **Extraction = mid tier.** `extraction` maps to GPT-4o-mini by default. Extraction jobs are token-heavy; do not promote to a more expensive model without cost review.
- **Concierge = protected UX tier.** Guest concierge stays in-house by default. If explicitly enabled, it may use Claude Haiku 4.5 for higher-quality guest responses.
- **General fallback = safe default.** `general` maps to GPT-4o-mini.
- **Host-side PII is in scope.** The normalizer/extraction path now uses the router, so house manuals, lockbox codes, owner phone numbers, cleaner contacts, etc. must pass through the existing redaction layer before any external OpenRouter call.
- **No LLM normalization.** Deterministic normalization must remain code. This router must not be used for field normalization.
- **Zero-retention external routing is mandatory.** All OpenRouter calls remain ZDR-only, with hardened provider constraints.

## Branch / workflow

- Work on branch `feature/legal-compliance` (already checked out). Commit there. Do **not** merge to main. Do **not** open a new PR.
- Commit author:

```bash
git -c user.name="John Mundia" -c user.email="john.mundia@flyntlok.com" commit
```

## Current state

- `lib/router/modelRouter.ts`:
  - `routedCompletion(messages, opts, _route)`.
  - No key → in-house `getAIProvider().generate()`.
  - Key → `openrouterGenerate()`, which:
    - redacts via `redactMessages`;
    - refuses via `ExternalRouteRefused` if `containsLikelyPII` is still true post-redaction;
    - POSTs to OpenRouter with `X-OpenRouter-ZDR: true`;
    - sends `provider: { zdr: true }`;
    - uses `serverEnv.openrouterModel`;
    - falls back to in-house with **original** messages on any error.
- `TaskType = 'extraction' | 'concierge' | 'classification' | 'general'`.
- `classifyTask(hint)` exists but `_route` is currently ignored for model selection.
- `RouteOptions { task?: TaskType }`.
- Env fields: `openrouterApiKey`, `openrouterModel`, `openrouterBaseUrl`.
- Normalizer is the only router caller today.
- Guest concierge calls in-house provider directly. Leave default behavior unchanged.
- Redaction source of truth: `lib/ai/redaction.ts`. Do **not** weaken it.

## Live OpenRouter pricing

Per 1M tokens, verified 2026-07-22:

| Model | Input | Output | Router tier |
|---|---:|---:|---|
| `openai/gpt-4o-mini` | $0.15 | $0.60 | extraction/general |
| `meta-llama/llama-3.1-8b-instruct` | $0.05 | $0.08 | classification |
| `anthropic/claude-haiku-4.5` | $1.00 | $5.00 | concierge, opt-in only |

Use Llama only for cheap classification. Do not use it for extraction or concierge.

## Required changes

### 1. Env: per-tier model slugs

In `lib/env.ts`, add alongside the existing OpenRouter fields:

```ts
openrouterModelExtraction: process.env.OPENROUTER_MODEL_EXTRACTION ?? 'openai/gpt-4o-mini',
openrouterModelClassification: process.env.OPENROUTER_MODEL_CLASSIFICATION ?? 'meta-llama/llama-3.1-8b-instruct',
openrouterModelConcierge: process.env.OPENROUTER_MODEL_CONCIERGE ?? 'anthropic/claude-haiku-4.5',
openrouterModelGeneral: process.env.OPENROUTER_MODEL_GENERAL ?? 'openai/gpt-4o-mini',

// Opt-in: route guest concierge through OpenRouter.
// OFF by default so concierge stays on the in-house OpenAI provider.
openrouterRouteConcierge: bool(process.env.OPENROUTER_ROUTE_CONCIERGE, false),
```

Keep `openrouterModel` as the ultimate fallback slug. Reuse the existing `bool()` helper.

### 2. Router: tier→model selection

In `lib/router/modelRouter.ts`:

#### 2a. Add pure `modelForTask`

```ts
function modelForTask(task: TaskType): string {
  const map: Record<TaskType, string> = {
    extraction: serverEnv.openrouterModelExtraction,
    classification: serverEnv.openrouterModelClassification,
    concierge: serverEnv.openrouterModelConcierge,
    general: serverEnv.openrouterModelGeneral,
  };

  const selected = map[task]?.trim();
  return selected ? selected : serverEnv.openrouterModel;
}
```

Mapping:

- `extraction` → `openrouterModelExtraction`
- `classification` → `openrouterModelClassification`
- `concierge` → `openrouterModelConcierge`
- `general` / default → `openrouterModelGeneral`
- Empty mapped value → fallback to `serverEnv.openrouterModel`

#### 2b. `openrouterGenerate()` takes resolved model slug

Change signature so the model is passed in instead of hardcoded:

```ts
openrouterGenerate(messages, opts, modelSlug)
```

Keep redaction, post-redaction PII refusal, ZDR header + body exactly as-is except for the ZDR hardening below.

#### 2c. ZDR hardening

Keep:

```ts
headers: {
  'X-OpenRouter-ZDR': 'true',
}
```

Update body provider block to:

```ts
provider: {
  zdr: true,
  data_collection: 'deny',
  require_parameters: true,
}
```

Do **not** add `only: []`.

#### 2d. `routedCompletion()`

```ts
routedCompletion(messages, opts, route)
```

Logic:

1. No `openrouterApiKey` → in-house, unchanged.
2. `task = route?.task ?? 'general'`.
3. **Concierge guard:**
   - If `task === 'concierge'` and `serverEnv.openrouterRouteConcierge !== true`:
     - use in-house provider;
     - do **not** route concierge externally;
     - log `concierge_routing_disabled_inhouse` at debug.
4. Else:
   - call `openrouterGenerate(messages, opts, modelForTask(task))`;
   - on any error → fallback to in-house with **original** messages;
   - keep `openrouter_route_failed_fallback` warn log.

### 3. Wire normalizer to declare extraction tier

In `lib/normalizer/index.ts`, keep the injectable `GenerateFn` seam for tests, but make the default route through `routedCompletion` as extraction:

```ts
const generate: GenerateFn = (m, o) =>
  routedCompletion(m, o, { task: 'extraction' });
```

The existing injectable override must continue to work unchanged.

Rationale: normalizer/extraction is host-side document ingestion. All host content must go through the router redaction/ZDR path.

### 4. Tests

Add `lib/router/modelRouter.test.ts` with Vitest. Mock:

- `serverEnv`;
- in-house provider;
- global `fetch`.

Cover:

- No key → calls in-house provider; never fetches OpenRouter.
- Key + `task: 'extraction'` → fetch body `model === 'openai/gpt-4o-mini'` or env override.
- Key + `task: 'classification'` → fetch body `model === 'meta-llama/llama-3.1-8b-instruct'`.
- Key + `task: 'general'` → fetch body `model === 'openai/gpt-4o-mini'`.
- Empty mapped env value → falls back to `serverEnv.openrouterModel`.
- Key + `task: 'concierge'`, `openrouterRouteConcierge === false` → in-house provider, no fetch.
- Key + `task: 'concierge'`, `openrouterRouteConcierge === true` → fetch body `model === 'anthropic/claude-haiku-4.5'`.
- PII survives redaction → `ExternalRouteRefused` thrown internally → fallback to in-house.
- No unredacted host content appears in any OpenRouter fetch body.
- OpenRouter returns 500 → fallback to in-house with original messages.
- Every OpenRouter fetch includes:
  - header `X-OpenRouter-ZDR: true`;
  - body `provider.zdr === true`;
  - body `provider.data_collection === 'deny'`;
  - body `provider.require_parameters === true`.

### 5. `.env.example`

Document under the existing `OPENROUTER` block:

```bash
OPENROUTER_API_KEY=

# Existing fallback / default
OPENROUTER_MODEL=openai/gpt-4o-mini

# Tiered routing — all optional.
# Extraction: token-heavy document ingestion. Keep mid-tier.
OPENROUTER_MODEL_EXTRACTION=openai/gpt-4o-mini

# Classification/routing: cheap tier only.
OPENROUTER_MODEL_CLASSIFICATION=meta-llama/llama-3.1-8b-instruct

# Concierge: opt-in only. Higher quality, but more expensive.
OPENROUTER_MODEL_CONCIERGE=anthropic/claude-haiku-4.5

# General fallback.
OPENROUTER_MODEL_GENERAL=openai/gpt-4o-mini

# Route guest concierge through OpenRouter?
# Default false: concierge remains in-house to protect guest UX.
OPENROUTER_ROUTE_CONCIERGE=false
```

Include pricing note:

```bash
# Pricing per 1M tokens:
#   openai/gpt-4o-mini                  $0.15 / $0.60
#   meta-llama/llama-3.1-8b-instruct    $0.05 / $0.08
#   anthropic/claude-haiku-4.5          $1.00 / $5.00
```

## Verification

Run before committing and report exact results:

1. `timeout 300 npx tsc --noEmit` → must exit 0.
2. `npx vitest run lib/router/modelRouter.test.ts lib/ai/redaction.test.ts lib/normalizer` → all pass. Report counts.
3. `timeout 540 npx next build` after `rm -rf .next` → exit 0.

Report the final commit SHA on `feature/legal-compliance`. Do **not** deploy.

## Hard constraints

- Do **not** log or hardcode any API key.
- Do **not** weaken `lib/ai/redaction.ts`.
- Do **not** change guest concierge default behavior; it stays in-house unless explicitly enabled.
- Do **not** touch billing, Stripe, or legal-doc files.
- Do **not** use this router for deterministic normalization.
- Do **not** introduce per-field fan-out through the router.
- Additive, reversible changes only.
- External OpenRouter calls must remain ZDR-only with `data_collection: 'deny'` and `require_parameters: true`.
