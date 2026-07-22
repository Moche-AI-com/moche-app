# OpenRouter Tiered Model Routing — Build Spec

## Goal
Extend the existing single-model OpenRouter POC in `lib/router/modelRouter.ts` into a **tiered** router that picks a cheaper or higher-quality model per task type, to reduce cost while preserving compliance (PII redaction + ZDR) and guest UX quality. This is an EXTENSION of existing code — do NOT rewrite from scratch. Do NOT make destructive changes. Keep the default-OFF behavior when no `OPENROUTER_API_KEY` is set.

## Branch / workflow
- Work on branch `feature/legal-compliance` (already checked out). Commit there. Do NOT merge to main. Do NOT open a new PR (changes ride on existing PR #3 context, or just push to the branch).
- Commit author: `git -c user.name="John Mundia" -c user.email="john.mundia@flyntlok.com" commit`.

## Current state (verified — do not re-derive destructively)
- `lib/router/modelRouter.ts` (118 lines): `routedCompletion(messages, opts, _route)` — if no `openrouterApiKey`, calls in-house `getAIProvider().generate()`. Else `openrouterGenerate()` which: redacts via `redactMessages`, refuses (throws `ExternalRouteRefused`) if `containsLikelyPII` still true post-redaction, POSTs to OpenRouter with `X-OpenRouter-ZDR: true` header + `provider: { zdr: true }` body, model = `serverEnv.openrouterModel`. Any error → fallback to in-house provider with ORIGINAL messages.
- `TaskType = 'extraction' | 'concierge' | 'classification' | 'general'` and `classifyTask(hint)` exist but `_route` is currently IGNORED for model selection.
- `RouteOptions { task?: TaskType }`.
- Env (`lib/env.ts` ~line 37-39): `openrouterApiKey`, `openrouterModel` (default `openai/gpt-4o-mini`), `openrouterBaseUrl`.
- Only caller through the router today: `lib/normalizer/index.ts` (extraction). Guest concierge (`lib/guest/concierge.ts`) calls `getAIProvider().generate()` DIRECTLY — it does NOT use the router. Leave concierge in-house by default.
- Redaction single source of truth: `lib/ai/redaction.ts` (+ `.test.ts`, 21 tests passing). Do NOT weaken redaction.

## Live OpenRouter pricing (per 1M tokens, verified 2026-07-22)
- `openai/gpt-4o-mini` — $0.15 / $0.60
- `meta-llama/llama-3.1-8b-instruct` — $0.05 / $0.08
- `anthropic/claude-haiku-4.5` — $1.00 / $5.00

## Required changes

### 1. Env: per-tier model slugs (all optional, with safe defaults)
In `lib/env.ts`, add alongside the existing openrouter fields:
```
openrouterModelExtraction: process.env.OPENROUTER_MODEL_EXTRACTION ?? 'openai/gpt-4o-mini',
openrouterModelClassification: process.env.OPENROUTER_MODEL_CLASSIFICATION ?? 'meta-llama/llama-3.1-8b-instruct',
openrouterModelConcierge: process.env.OPENROUTER_MODEL_CONCIERGE ?? 'anthropic/claude-haiku-4.5',
openrouterModelGeneral: process.env.OPENROUTER_MODEL_GENERAL ?? 'openai/gpt-4o-mini',
// Opt-in: route guest concierge through OpenRouter. OFF by default so concierge
// stays on the in-house OpenAI provider (protects guest UX until cost data reviewed).
openrouterRouteConcierge: bool(process.env.OPENROUTER_ROUTE_CONCIERGE, false),
```
Keep the existing `openrouterModel` as the ultimate fallback slug. Reuse the existing `bool()` helper already in env.ts.

### 2. Router: tier→model selection
In `lib/router/modelRouter.ts`:
- Add a pure function `modelForTask(task: TaskType): string` that maps:
  - `extraction` → `openrouterModelExtraction`
  - `classification` → `openrouterModelClassification`
  - `concierge` → `openrouterModelConcierge`
  - `general` (and default) → `openrouterModelGeneral`
  - If a mapped value is empty, fall back to `serverEnv.openrouterModel`.
- `openrouterGenerate()` takes the resolved model slug as an argument (instead of hardcoding `serverEnv.openrouterModel`). Keep redaction, the post-redaction PII refusal, ZDR header+body EXACTLY as-is.
- **ZDR hardening:** add `provider: { zdr: true, data_collection: 'deny' }` and `only: []` is NOT needed, but ADD `provider.require_parameters: true`. Keep the `X-OpenRouter-ZDR: true` header. (Belt & braces — restrict to zero-retention routing.)
- `routedCompletion(messages, opts, route)`:
  - If no `openrouterApiKey` → in-house (unchanged).
  - Determine `task = route?.task ?? 'general'`.
  - **Concierge guard:** if `task === 'concierge'` AND `serverEnv.openrouterRouteConcierge !== true` → use in-house provider (do NOT route concierge externally by default). Log `concierge_routing_disabled_inhouse` at debug.
  - Else → `openrouterGenerate(messages, opts, modelForTask(task))`; on ANY error → fallback to in-house with ORIGINAL messages (unchanged behavior, keep the `openrouter_route_failed_fallback` warn log).

### 3. Wire the normalizer to declare its task tier
In `lib/normalizer/index.ts`, the `generate` call currently passes `(messages, { temperature, maxTokens })`. Update the default `routedCompletion` usage so extraction passes the route: call `routedCompletion(messages, opts, { task: 'extraction' })`. Since the injected `GenerateFn` type is `(messages, opts) => ...`, extend the internal default to pass the route WITHOUT breaking the injectable seam used by tests — e.g. wrap: `const generate: GenerateFn = (m, o) => routedCompletion(m, o, { task: 'extraction' })` as the default param, keeping the injectable override for unit tests. Verify existing normalizer tests still pass.

### 4. Tests (add to a new `lib/router/modelRouter.test.ts`)
Use vitest (already in repo; see `lib/ai/redaction.test.ts` for style). Mock `serverEnv` and the in-house provider + global `fetch`. Cover:
- No key → calls in-house provider, never fetches OpenRouter.
- Key set + task `extraction` → fetch body `model === 'openai/gpt-4o-mini'` (or the env override).
- Key set + task `classification` → model === llama slug.
- Key set + task `concierge` with `openrouterRouteConcierge=false` → in-house provider, no fetch.
- Key set + task `concierge` with `openrouterRouteConcierge=true` → fetch body model === haiku slug.
- PII survives redaction → `ExternalRouteRefused` thrown internally → falls back to in-house (assert in-house called, and that no un-redacted content is in any fetch body).
- OpenRouter returns 500 → falls back to in-house with original messages.
- Assert every OpenRouter fetch includes `X-OpenRouter-ZDR: true` header and `provider.zdr === true` + `provider.data_collection === 'deny'` in the body.

### 5. .env.example
Document the new vars under the existing OPENROUTER block with brief comments and the pricing note. Keep `OPENROUTER_API_KEY=` empty.

## Verification (run before committing; report exact results)
1. `timeout 300 npx tsc --noEmit` → must exit 0.
2. `npx vitest run lib/router/modelRouter.test.ts lib/ai/redaction.test.ts lib/normalizer` → all pass. Report counts.
3. `timeout 540 npx next build` (rm -rf .next first) → exit 0.
Report the final commit SHA on `feature/legal-compliance`. Do NOT deploy (main agent handles deploy after setting the key).

## Hard constraints
- Do NOT log or hardcode any API key. Do NOT weaken `lib/ai/redaction.ts`. Do NOT change guest concierge default behavior (stays in-house). Do NOT touch billing, Stripe, or legal doc files. Additive, reversible changes only.
