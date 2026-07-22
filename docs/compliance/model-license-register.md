# AI Model License Register

Authoritative record of AI models and their licensing/usage terms. "State in code"
reflects what is actually wired today (see `LEGAL_COMPLIANCE_SPEC.md` → REALITY CHECK).
Only models that are actually referenced in the codebase are treated as in-use.

| Model / family | Provider | License / terms | State in code | Notes |
|---|---|---|---|---|
| GPT chat completions | OpenAI | Commercial API terms + OpenAI DPA | **LIVE** — via `lib/ai/` provider abstraction; `AI_API_KEY` set | Primary production model. |
| `text-embedding-3-small` (dim 1536, LOCKED) | OpenAI | Commercial API terms | **LIVE** — embedding model | Dimension is fixed; do not change. |
| Models routed via OpenRouter | Various, via OpenRouter | Per underlying model + OpenRouter terms; ZDR requested | **DORMANT** — `openrouterGenerate` path exists, no `OPENROUTER_API_KEY` | Not active. Redaction + ZDR enforced if enabled (`lib/router/modelRouter.ts`). |
| Meta Llama 3 | Meta | Llama 3 Community License + Acceptable Use Policy | **Not deployed** as a running model | AUP flowed down in `/legal/acceptable-use`; attribution in `/legal/open-source` per license-register requirement. |
| Mistral | Mistral | Apache-2.0 (open-weight variants) | **Not currently in use** | Listed for completeness only. |
| BGE / FastEmbed | BAAI / community | MIT / Apache-2.0 | **Not deployed** — evaluated, not in code | Active embedding model is OpenAI `text-embedding-3-small`. |
| Docling / PaddleOCR | IBM / PaddlePaddle | Apache-2.0 | **Not deployed** — not in code | Listed only to record they are not used. |

## Controls tied to model use

- **PII redaction before external routing** — `lib/ai/redaction.ts` (`redactPII`, `redactMessages`, `containsLikelyPII`), applied on the external path in `lib/router/modelRouter.ts`.
- **Zero-Data-Retention enforcement** — when the OpenRouter path is enabled, requests set the ZDR header/flag; if PII is still detected post-redaction the external route is refused and it falls back to OpenAI (`ExternalRouteRefused`).
- **AUP flow-down** — `/legal/acceptable-use` flows down Llama 3 AUP restrictions to hosts and guests regardless of which model serves a request.

Update this register whenever a model integration is added, activated, or removed.
