# Legal, Compliance, Security & Support Layer — Build Spec

**Branch:** `feature/legal-compliance` (DO NOT MERGE — open PR only)
**App:** Next.js App Router + TypeScript + Supabase + Stripe (self-serve billing).
**Markets:** US + EU/UK. GDPR + UK GDPR + CCPA/CPRA.
**Data roles:** Moche-AI = **CONTROLLER** for host/billing/marketing data; **PROCESSOR** for guest/property data supplied by hosts.

---

## CRITICAL GROUND RULES (do not violate)

1. **Extend, do not rebuild.** Reuse existing code. Do NOT rewrite working modules. Do NOT make destructive DB changes.
2. **No false certification claims.** Do NOT assert "SOC 2 certified", "ISO 27001 certified", or any cert we don't hold. Frame controls as *aligned with* ISO 27001 / SOC 2 control families.
3. **Every legal promise must be backed by a real technical control in the code AND a support runbook.** If a control does not exist in the codebase, do NOT promise it. See "REALITY CHECK" below for what is/ isn't wired.
4. **Every legal document must include:** a visible `Last Updated` date, a semantic `version` string (e.g. `v1.0.0`), and an `[ATTORNEY REVIEW REQUIRED]` banner on high-risk clauses.
5. **Flag every high-risk clause for attorney review** inline in the doc AND collect them in the PR description.
6. **Landing footer must stay "Built in Somerville, MA".** Do not remove it.
7. Do NOT set/guess a Stripe API version in new code. Existing code pins `2024-06-20` — leave it.

---

## REALITY CHECK — what is actually wired (base legal claims on THIS, not aspirations)

| Capability | State in code | Legal doc may claim? |
|---|---|---|
| OpenAI (chat + embeddings, `text-embedding-3-small`, dim 1536 LOCKED) | **LIVE** via `lib/ai/` provider abstraction. `AI_API_KEY` set. | Yes — primary AI subprocessor. |
| PII redaction before external routing | **LIVE** — `lib/router/modelRouter.ts` `redactPII()` (line 32). Applied on external path only. | Yes — "PII redacted before third-party routing". |
| OpenRouter | **DORMANT** — code path exists (`openrouterGenerate`) but `OPENROUTER_API_KEY` NOT set. Falls back to OpenAI. | Only as "may route to" / conditional. Do NOT claim active ZDR traffic today. |
| Ollama (local models) | **NOT deployed** in this app. | Do NOT claim as live. May list as "planned/optional self-hosted fallback" only if clearly future-tense. |
| Docling / PaddleOCR / local OCR | **NOT in code.** | Do NOT claim as live processors. |
| Firecrawl (URL ingestion) | **LIVE** — `lib/ingest/firecrawl.ts`, credential-gated server-only client. | Yes — subprocessor for host-initiated URL ingestion. |
| Supabase (Postgres + pgvector + auth) | **LIVE**. | Yes — primary data subprocessor. |
| Stripe (billing) | **LIVE**. | Yes — payment subprocessor. |
| Resend (email) | **LIVE** (`lib/notify` / email). | Yes. |
| Twilio (SMS guest verification) | **LIVE** (guest verify flow). | Yes. |
| Sentry (error monitoring) | **LIVE**. | Yes. |
| Cloudflare (Turnstile + edge) | **LIVE** (Turnstile in GuestPortal verify). | Yes. |
| PostHog (product analytics) | **LIVE** — `lib/posthog-server.ts`, `app/providers.tsx`. | Yes — analytics subprocessor. |

**BGE / Mistral / FastEmbed:** NOT the active embedding model (we use OpenAI `text-embedding-3-small`). Only list in the model-license register if actually referenced in code; otherwise mark clearly as "not currently in use".

---

## EXISTING CODE THE SUBAGENT MUST EXTEND (do not duplicate)

- **`lib/router/modelRouter.ts`** — ALREADY has `redactPII(text)`, `classifyTask(hint)`, `routedCompletion(messages, opts, route)`, `openrouterGenerate`. Part 2B/2C must **reuse/extend these**. `lib/ai/redaction.ts` should re-export / wrap the existing `redactPII` (single source of truth) and add the extra patterns (credit cards, postal addresses, access/door codes already partly covered by `SECRET_LABEL_RE`). ZDR-enforcement logic belongs inside/next to `routedCompletion`, not a parallel router.
- **`app/api/stripe/webhook/route.ts`** — ALREADY verifies signatures (raw body), maps Stripe status→`subscription_status` enum via `mapStatus`, handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`→`past_due`. Part 4 must **extend this file**: add `invoice.payment_succeeded` (clear `past_due`→`active`), ensure `.deleted`→`canceled`, and gate guest AI access on status. Do NOT rewrite.
- **`subscription_status` enum (DB)** already = `trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid | paused`. **Use these existing values.** Do NOT invent `suspended_payment`. Map: dunning-exhausted/unpaid → `unpaid` or `past_due`; hard-cancel → `canceled`. "Guest AI access" gate = active statuses are `trialing, active, past_due` (grace); `unpaid, canceled, incomplete_expired, paused` = blocked. Mirror existing `ACTIVE_STATUSES` in `lib/billing/entitlements.ts` (line 23) — reuse it, add a `guestAiEnabled` derivation.
- **Subscriptions are keyed by `host_account_id`** (NOT organization_id). There is no `organizations` table — the tenant is `host_accounts`. Legal-acceptance FKs reference the authenticated user (`auth.users.id`) and optionally `host_account_id`.
- **Guest concierge** `lib/guest/concierge.ts` ALREADY has: `EMERGENCY_PATTERNS` regex (line 110), `isEmergency` flag, emergency instruction in system prompt (lines 71/98 — "contact local emergency services 911/112 first"), `shouldEscalate`, anti-injection guardrail, answer cache. Part 2G must ADD a **persistent AI-disclosure banner** in the UI, not re-implement emergency logic.
- **Guest UI** = `app/g/[slug]/GuestPortal.tsx`. Per-message emergency warning already renders (line 421). Add the persistent "You're chatting with an AI assistant" disclosure at the top of the chat panel + near the input.
- **Host account:** `host_accounts` table, `owner_id` → `auth.users.id`.

---

## PART 1 — Public Legal Center (`app/legal/*`)

Shared `app/legal/layout.tsx`:
- Left TOC sidebar linking all pages; sticky on desktop, collapsible on mobile.
- Header block per page rendering `Last Updated` date + `version` string (read from a shared `lib/legal/registry.ts` metadata map so dates/versions live in one place).
- Print-friendly CSS (`@media print`).
- Footer with links to every legal page — and these footer links must ALSO appear in the global site footer and next to the **Create Account** and **Checkout** CTAs. Keep "Built in Somerville, MA".

Every page: MDX or TSX; each high-risk clause wrapped in an `<AttorneyReview>` component that renders a visible `[ATTORNEY REVIEW REQUIRED]` banner.

Routes (12):

1. **`terms`** — STR-specific ToS. **HIGHEST-PRIORITY CLAUSE: AI OUTPUT LIABILITY** — service provided "as-is"; AI answers are informational only, NOT for emergency, medical, legal, financial, or safety-critical decisions; for emergencies contact local emergency services / the host directly. Liability cap = trailing 12 months of fees paid. Governing law = **Massachusetts**. Include **EU AI Act Art. 50** transparency disclosure (users are interacting with AI). `[ATTORNEY REVIEW REQUIRED]` on: liability cap, AI-output disclaimer, indemnity, governing law.
2. **`privacy`** — GDPR + UK GDPR + CCPA/CPRA. Data categories table; legal bases (contract, legitimate interest, consent); third-party AI processing disclosure (OpenAI primary; OpenRouter *conditional/optional*); state that **PII is redacted before content is sent to any external router** and we seek Zero-Data-Retention terms where available; cross-border transfers via **SCCs + UK IDTA/Addendum**; explicit **"We do not sell personal information"**. Data subject / consumer rights + how to exercise (link to `support` + in-app export/delete). `[ATTORNEY REVIEW REQUIRED]` on legal bases, international transfer mechanism, sale/sharing disclosure.
3. **`refund`** — SaaS billing policy. Monthly: cancel anytime, no proration, access to period end. Annual: 14-day refund window IF unused, otherwise non-refundable. Dunning/grace period, chargeback handling. Must match Part 4 webhook behavior + Stripe config.
4. **`dpa`** — GDPR Art. 28 Data Processing Addendum, click-to-accept. Schedule 1 (processing details) + Schedule 2 (technical & organizational measures — mirror `security` page). Subprocessor list + objection right. SCCs + UK Addendum. 72-hour breach notification. CCPA "service provider" terms. `[ATTORNEY REVIEW REQUIRED]` throughout.
5. **`msa`** — enterprise Master Service Agreement template. **Liability caps + governing law MUST be identical to `terms`** (Massachusetts, trailing-12-month cap). `[ATTORNEY REVIEW REQUIRED]`.
6. **`security`** — infra/app/AI/ops controls grouped under ISO 27001 / SOC 2 control **families** (Access Control, Encryption, Logging & Monitoring, Vulnerability Mgmt, Incident Response, Vendor Mgmt, Data Protection). **NO certification claims** — say "aligned with" / "modeled on". Base every listed control on something real (Supabase RLS, Turnstile, Sentry, PII redaction, TLS, Stripe PCI outsourcing). `[ATTORNEY REVIEW REQUIRED]` on any forward-looking control.
7. **`subprocessors`** — table columns: Vendor | Purpose | Data Processed | Region | DPA link | SCCs | Retention. Seed rows: Supabase, Vercel, Stripe, Resend, Twilio, OpenAI, OpenRouter (mark "conditional/optional — not currently active"), Firecrawl, Sentry, Cloudflare, PostHog. Pull from the same `lib/legal/subprocessors.ts` data used by the DPA.
8. **`acceptable-use`** — AUP; flows down Meta Llama 3 AUP restrictions (even though primary model is OpenAI, list Llama AUP flow-down as required by the model license register). Prohibited uses, enforcement.
9. **`ai-policy`** — guest-facing AI disclosure; high-stakes answers must be graph/source-backed and verified; refusal + escalation behavior (matches `concierge.ts`). No emergency/medical/legal/financial advice.
10. **`open-source`** — "Built with Meta Llama 3" attribution + Apache-2.0 / MIT notices. Link to `THIRD_PARTY_LICENSES.md`.
11. **`cookies`** — cookie/tracker table (Turnstile, PostHog if wired, auth/session). Consent posture for EU.
12. **`support`** — how to get help, response targets, how to exercise data rights, security contact.

---

## PART 2 — Technical enforcement

**2A. Supabase migration** — write SQL to `supabase-migrations-LEGAL.sql` in repo root (do NOT apply — the main agent applies via Supabase tooling after review).
- `legal_documents` (id, slug, version text, effective_date date, sha256 text, created_at) — versioned registry of published docs.
- `legal_acceptances` (id, user_id → auth.users, host_account_id → host_accounts nullable, document_slug, document_version, accepted_at timestamptz, ip inet, user_agent text, context text — 'signup'|'checkout'|'dpa'|'reacceptance'). RLS: users can insert/select their own rows; service role full. Index on (user_id, document_slug).

**2B. `lib/ai/redaction.ts`** — single-source PII redaction. Re-export/extend existing `redactPII` from `modelRouter.ts` (or move canonical impl here and have modelRouter import it — pick one home, no divergence). Add patterns: credit-card (Luhn-shaped 13-19 digit), postal addresses (best-effort), access/door/wifi codes (extend `SECRET_LABEL_RE`), emails, phones. **Unit tests** in `lib/ai/redaction.test.ts` covering each category + false-positive guards.

**2C. ZDR enforcement in `lib/router/modelRouter.ts`** — extend `routedCompletion`: when routing externally to OpenRouter AND payload contains PII (post-redaction sanity check), set OpenRouter ZDR request header/flag (`X-OpenRouter-ZDR` / provider `zdr: true` per their API) OR refuse external route and fall back to in-house OpenAI/Ollama. Keep the dormant-by-default behavior (no `OPENROUTER_API_KEY` → straight to OpenAI, unchanged). Document that ZDR is enforced only when the external path is active.

**2D.** `docs/compliance/model-license-register.md` + `THIRD_PARTY_LICENSES.md`. Register: OpenAI models (commercial API terms), Meta Llama 3 (community license + AUP), Mistral (Apache-2.0) — only if referenced; mark unused ones clearly. Include BGE, Docling, PaddleOCR, FastEmbed ONLY as "evaluated / not currently deployed" if not in code. Be accurate.

**2E.** `docs/compliance/ai-governance-register.md` — model inventory, purpose, data flows, human-oversight points, risk classification (EU AI Act), redaction & routing controls.

**2F. Data export + deletion tooling** — GDPR Art. 20 (portability) + Art. 17 (erasure).
- Export: server action / API route producing a JSON bundle of the user's data across Supabase tables (host account, properties, brain items, subscriptions metadata — NOT card data) + vector nodes. Downloadable.
- Deletion: tooling that removes the user's personal data across Supabase + `property_knowledge_nodes` / chunks (vector), **while preserving billing/legal records required for legal/tax retention** (subscriptions, invoices, `legal_acceptances`). Two-step (request → confirm). Tie to `data-deletion-request` runbook.

**2G. Guest AI disclosure component (EU AI Act Art. 50)** — add a persistent, visible "You are chatting with an AI assistant — answers may be imperfect; for emergencies contact local services or your host" banner to `app/g/[slug]/GuestPortal.tsx` (top of chat panel + subtle note near input). Keep existing per-message emergency warning. Add a small reusable `AiDisclosure` component. Emergency routing already handled in `concierge.ts` — verify the UI surfaces `isEmergency` prominently (it does at line 421 — leave/enhance).

**Clickwrap:** add a required, unchecked-by-default checkbox on signup AND checkout: "I agree to the Terms, Privacy Policy[, and DPA]". On submit, record a `legal_acceptances` row (user_id, version, ip, user_agent, context). **Re-acceptance flow:** on login, if the user's accepted version < current version in `legal_documents`, show a re-acceptance modal before continuing.

---

## PART 3 — Runbooks (`docs/support/*.md`)

One file each, same structure (Trigger | Owner | Steps | Escalation path | Customer comms template):
- `failed-payment.md`
- `login-issue.md`
- `data-deletion-request.md` (ties to 2F deletion tooling)
- `incorrect-ai-answer.md` (ties to concierge escalation)
- `emergency-safety.md` (guest reports emergency)
- `security-incident.md` (ties to 72h breach notice in DPA + `security` page)

---

## PART 4 — Stripe webhook billing state (extend `app/api/stripe/webhook/route.ts`)

- Add `invoice.payment_succeeded`: clear dunning — set `past_due`→`active` (only if currently past_due/unpaid; don't clobber `canceled`).
- Keep `invoice.payment_failed`→`past_due` (exists). If Stripe reports subscription `unpaid` (retries exhausted) via `customer.subscription.updated`, `mapStatus` already handles it → `unpaid`.
- `customer.subscription.deleted`→`canceled` (exists).
- **Enable Smart Retries / dunning** — this is a Stripe Dashboard setting, NOT code. Document it in `refund.md` + `failed-payment.md` + PR pre-launch checklist as an action item for the human. Do not attempt via API in this branch.
- **Gate guest AI access on billing status:** in the guest concierge request path (guest chat route is **`app/api/guest/[slug]/chat/route.ts`**; gate there or in `concierge.ts` entry), look up the property's host_account subscription status; if not in the "guest AI enabled" set (`trialing, active, past_due`), return a graceful "concierge temporarily unavailable" response instead of calling the model. Reuse `entitlements.ts`.

---

## DELIVERABLES

1. All of the above on branch `feature/legal-compliance`.
2. `docs/compliance/README.md` — **traceability matrix**: each legal promise → backing technical control (file/function) → support runbook. Every row must resolve to real code.
3. **PR description** including: what's built (by part), the full list of `[ATTORNEY REVIEW REQUIRED]` items, and a **pre-launch checklist** (attorney review, enable Stripe Smart Retries, set OPENROUTER_API_KEY + confirm ZDR if activating external routing, confirm subprocessor DPAs signed, publish doc versions to `legal_documents`, apply the Supabase migration).
4. `tsc --noEmit` clean and `next build` clean before opening the PR.
5. **DO NOT MERGE.** Open the PR against `main` and stop.
