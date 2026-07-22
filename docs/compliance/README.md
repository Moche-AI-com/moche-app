# Compliance Traceability Matrix

Every public legal promise maps to a real technical control (file/function) **and** a
support runbook. If a row cannot resolve to real code, the promise does not ship.

Related registers: [model-license-register.md](./model-license-register.md),
[ai-governance-register.md](./ai-governance-register.md).

| Legal promise | Source doc | Backing control (file / function) | Runbook |
|---|---|---|---|
| Users are told they're interacting with AI (EU AI Act Art. 50) | `/legal/terms`, `/legal/ai-policy` | `components/AiDisclosure.tsx`; rendered in `app/g/[slug]/GuestPortal.tsx` | `incorrect-ai-answer.md` |
| No emergency/medical/legal/financial reliance; direct to emergency services | `/legal/terms`, `/legal/ai-policy` | `lib/guest/concierge.ts` `EMERGENCY_PATTERNS`, `isEmergency`, system-prompt instruction; per-message UI warning | `emergency-safety.md` |
| Concierge refuses/escalates when not confident | `/legal/ai-policy` | `lib/guest/concierge.ts` (`shouldEscalate`, `DEFAULT_CONFIDENCE_THRESHOLD`) | `incorrect-ai-answer.md` |
| PII redacted before content sent to any external router | `/legal/privacy`, `/legal/security` | `lib/ai/redaction.ts` (`redactPII`, `redactMessages`, `containsLikelyPII`) + `lib/router/modelRouter.ts` | `security-incident.md` |
| Zero-Data-Retention sought on external routing | `/legal/privacy`, `/legal/subprocessors` | `lib/router/modelRouter.ts` (`X-OpenRouter-ZDR`, `provider.zdr`, `ExternalRouteRefused`) | — |
| OpenRouter conditional / not active today | `/legal/subprocessors` | `lib/legal/subprocessors.ts` (`active: false`); no `OPENROUTER_API_KEY` | — |
| We don't store card data (Stripe holds it) | `/legal/privacy`, `/legal/security` | Stripe checkout/webhook (`app/api/stripe/*`); export excludes card data (`lib/legal/data-rights.ts`) | `failed-payment.md` |
| Guest contact stored as irreversible hashes | `/legal/privacy`, `/legal/security` | Guest identity hashing (guest verify flow); export notes hashes | — |
| Data portability (export) | `/legal/privacy`, `/legal/support` | `lib/legal/data-rights.ts` `buildExportBundle`; `app/api/legal/export/route.ts`; Dashboard → Profile | `data-deletion-request.md` |
| Right to erasure, retaining billing/legal records | `/legal/privacy`, `/legal/support` | `lib/legal/data-rights.ts` `requestDeletion`/`confirmDeletion`; `app/api/legal/delete/route.ts` (two-step) | `data-deletion-request.md` |
| Clickwrap consent recorded (user, version, ip, UA) | `/legal/terms`, `/legal/dpa` | `lib/legal/acceptance.ts` `recordAcceptances`; signup + checkout actions; `legal_acceptances` table | — |
| Re-acceptance when doc version increases | `/legal/terms` | `lib/legal/acceptance.ts` `outstandingReacceptances`; `app/dashboard/ReacceptanceGate.tsx`; `app/api/legal/accept/route.ts`; `lib/legal/registry.ts` `CURRENT_VERSIONS` | — |
| Guest AI gated on billing status | `/legal/refund` | `lib/billing/entitlements.ts` `guestAiEnabled`/`isGuestAiEnabled`; `app/api/guest/[slug]/chat/route.ts` | `failed-payment.md` |
| Failed payment → grace; recovery restores access | `/legal/refund` | `app/api/stripe/webhook/route.ts` (`invoice.payment_failed`→`past_due`, `invoice.payment_succeeded`→`active`) | `failed-payment.md` |
| Access control / tenant isolation (RLS) | `/legal/security`, `/legal/dpa` Sch.2 | Supabase RLS; server-only service-role client (`lib/supabase/admin.ts`) | `security-incident.md`, `login-issue.md` |
| Encryption in transit; secrets never logged | `/legal/security` | TLS (hosting); `lib/log.ts` redaction | `security-incident.md` |
| Error monitoring | `/legal/security` | Sentry integration | `security-incident.md` |
| Bot mitigation on guest verification | `/legal/security`, `/legal/cookies` | Cloudflare Turnstile in guest verify | — |
| 72-hour breach notification | `/legal/dpa`, `/legal/security` | Process commitment | `security-incident.md` |
| Subprocessor list = single source of truth | `/legal/subprocessors`, `/legal/dpa` Sch.3 | `lib/legal/subprocessors.ts` → `components/legal/SubprocessorTable.tsx` | — |
| Model AUP flow-down (Llama 3) | `/legal/acceptable-use`, `/legal/open-source` | `THIRD_PARTY_LICENSES.md`; `model-license-register.md` | — |
| Liability cap = trailing 12 months; MA governing law (Terms == MSA) | `/legal/terms`, `/legal/msa` | Contract text (attorney review) | — |

## Documents pending attorney review

Clauses wrapped in `<AttorneyReview>` render a visible `[ATTORNEY REVIEW REQUIRED]`
banner. See the PR description for the consolidated list.

## Not-yet-live (do not claim as active)

- OpenRouter external routing (dormant; no API key).
- Ollama / Docling / PaddleOCR / BGE / FastEmbed (not deployed).
- Any formal certification (we say "aligned with", never "certified").
