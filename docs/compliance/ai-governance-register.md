# AI Governance Register

Internal record of the AI systems in Moche.AI: purpose, data flows, oversight
points, and risk classification. Supports EU AI Act readiness and periodic review.

## 1. System inventory

| System | Purpose | Model(s) | Entry point |
|---|---|---|---|
| Guest Concierge | Answer guest questions grounded in the host's Property Brain | OpenAI chat (LIVE); OpenRouter (dormant) | `app/api/guest/[slug]/chat/route.ts` → `lib/guest/concierge.ts` |
| Retrieval / embeddings | Embed property content & queries for semantic retrieval | OpenAI `text-embedding-3-small` (dim 1536) | `lib/ai/` |
| Model router | Task classification + optional external routing with redaction/ZDR | OpenAI default; OpenRouter conditional | `lib/router/modelRouter.ts` |

## 2. Risk classification (EU AI Act)

- The guest concierge is a **limited-risk** system whose primary obligation is
  **transparency** (Art. 50): users are told they are interacting with AI. This is
  surfaced by the `AiDisclosure` component in the guest portal and the `/legal/ai-policy` page.
- It is **not** used for safety-critical, emergency, medical, legal, or financial
  decision-making, and the product explicitly disclaims such use. Emergency inputs
  trigger a "contact local emergency services / the host" instruction.

## 3. Data flows

1. Guest question → guest chat route.
2. **Billing gate** — host account subscription status checked; if guest AI is not
   enabled (`trialing|active|past_due`), a graceful "unavailable" response is returned
   with no model call (`lib/billing/entitlements.ts` → `isGuestAiEnabled`).
3. Relevant Property Brain context retrieved (RLS/property-scoped).
4. Prompt assembled with anti-injection guardrail + emergency handling (`concierge.ts`).
5. Completion via `routedCompletion`. On the external path, content is **redacted**
   (`lib/ai/redaction.ts`); ZDR flag set; external route refused if PII persists.
6. Answer returned; low-confidence/high-stakes cases refuse and **escalate to host**.

## 4. Human oversight points

- Hosts author and correct the Property Brain (the AI's only knowledge source).
- Escalations route unanswered/low-confidence questions to a human host.
- Hosts review audit logs and notifications.

## 5. Controls

| Control | Implementation |
|---|---|
| Transparency (AI disclosure) | `components/AiDisclosure.tsx`, `/legal/ai-policy` |
| PII redaction before external routing | `lib/ai/redaction.ts` + `lib/router/modelRouter.ts` |
| Zero-Data-Retention on external path | `modelRouter.ts` (`X-OpenRouter-ZDR`, `ExternalRouteRefused`) |
| Emergency handling | `lib/guest/concierge.ts` `EMERGENCY_PATTERNS`, per-message UI warning |
| Access to AI gated on billing | `lib/billing/entitlements.ts`, guest chat route |
| Grounding / confidence threshold | `concierge.ts`, `DEFAULT_CONFIDENCE_THRESHOLD` |

## 6. Review cadence

Review this register when a model is added/activated/removed, when data flows
change, or at least annually.
