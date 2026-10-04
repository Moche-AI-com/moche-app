# AI routing and approved knowledge follow-up

Follow-up to the Property Brain release at `1480df1785c7ec38fa7fade10bba69dc135e19a9`, integrated onto current main at `e04f2ca`. This release extends the routing audit across setup, imports, AI drafting, learned guest answers, Guest Needs, translation, retrieval, and usage accounting. It introduces no database migration or Twilio configuration change. Newer upstream appliance guidance, source-backed local advice, one-off-answer guards, pasted listing imports, guest history, notifications and Trigger configuration are retained rather than replaced with the original September baseline.

## Routing contract

| Entry point | Route | Intended configuration and failure behavior |
|---|---|---|
| Exact current host-approved routine answer | Deterministic | No completion or embedding request when the answer is eligible and unambiguous. Current restrictions take precedence. |
| Wi-Fi access instructions | Deterministic where eligible | Return the approved password location and connection instructions, never a stored password. Missing guidance requests host help. |
| Grounded routine concierge request | `concierge` | Reviewed routine model chain, headed by configured Gemini 2.5 Flash; every OpenRouter attempt retains provider/model restrictions and outbound redaction. |
| Complex or insufficiently grounded concierge request | `concierge_complex` | Configured GPT-4o strong tier; no lightweight fallback. |
| Guest Needs interview and guest-origin translation | `concierge_complex` | Same protected strong tier and guest routing opt-out. Translation preserves the exact original on failure. |
| Setup listing extraction, knowledge cleanup and segmentation | `extraction` | Configured GPT-4o; no lightweight fallback. Extraction verifies the model against the actual resolved route. |
| Improve with AI, feature-note drafts, classification and learned-answer normalization | `brain_ops` | Configured GPT-4o; output remains editable or pending host review. |
| Query and document embeddings | Independent embedding adapter | Configured `text-embedding-3-small`; shared outbound sanitization, vector shape checks and model-specific usage rows. Existing explicit OpenRouter embedding opt-in is preserved; the default remains the separately configured embedding endpoint. |

The owner-approved production extraction setting was changed from `openai/gpt-4o-mini` to `openai/gpt-4o`; read-only configuration checks still show that saved value. No additional environment changes are part of this follow-up. These are application configuration choices, not claims about comparative vendor benchmarks or live provider availability.

## Protected transport

- Completion requests share one destination-aware transport, including `AI_BASE_URL` aliases that point to OpenRouter.
- Policy refusal and provider outages cannot cause a second unrestricted external request.
- The newer upstream independent outage fallback remains limited to explicitly enabled `general`/`classification` work after eligible outages. It is not a downgrade path for guest concierge, extraction, or Brain operations, and is not eligible after policy, authentication, parsing, or model-validation failures.
- Strong routes reject known lightweight model overrides and refuse an unexpected returned model.
- Credentials and likely personal information are sanitized before both chat and embedding requests. Stored host source text is not modified by outbound sanitization.
- Transport failures use stable error codes, not raw response bodies or parser exceptions.
- OpenRouter restrictions do not establish a retention guarantee for the separate direct embedding provider.

## Host review and guest retrieval

- Learned guest answers can be approved or modified into the appropriate Brain category and section. Short answers retain their reviewed question, and approval does not regenerate the text.
- Compare-and-set review decisions prevent concurrent duplicate application. Partial writes retain the decision and report incomplete filing or indexing rather than encouraging duplicate creation.
- Guest retrieval checks current source text, status, visibility, property, deletion state and host attribution. Stale chunks cannot override current approved structured values or feature restrictions.
- Explicitly allowlisted guest-safe structured fields and active host-created feature notes are included. Archived, restricted, unverified, expired, conflicting and secret values remain excluded.
- Generated graph derivatives are no longer published or read as authoritative guest facts. Existing graph rows are not deleted; future derivative publication needs an explicit review and lifecycle contract.
- Generated answer caches without adequate source provenance are bypassed. Eligible exact approved answers retain the direct fast path.
- Embedding usage and chat usage are recorded separately under their respective models.

## Import and workflow feedback

- Knowledge manuals and local references use explicit host-selected acquisition categories, not a property-listing cleanup prompt.
- Cleanup preserves operating steps and warnings; failed cleanup retains raw text. Oversized input bypasses model cleanup and explicitly warns about the bounded review draft.
- Original-source retention must succeed before a review proposal is queued. Retention failure is not retried through another content provider.
- Setup import results remain visible after removing the one-time URL parameter.
- Failed saves and indexing warnings retain host drafts and their section/visibility choices.
- Guest Needs checks safety on every guest turn, enforces the question cap even on valid model JSON, retains later guest facts, and shows urgent instructions on its completion screen.
- Locally authored emergency guidance remains visible when report persistence fails, with explicit unsaved/not-notified feedback instead of a false completion claim.
- Approval cannot report completed indexing unless the property-scoped ready transition updates a row. Partial application remains visible and does not permit duplicate approval retries.

## Verification and release gates

The companion validation record contains executable command output. Release requires independent review of the frozen tree, passing CI, a signed feature-branch commit, a pull request, and verification that the production deployment uses the merged commit.

All added tests use synthetic data, mocked provider requests, or isolated PostgreSQL. Offline browser checks exercise actual components but do not prove real handset delivery, live model service availability, or end-to-end provider acceptance.

## Deliberate limitations

- Twilio remains paused at the owner's request. No number, webhook, sender, consent, STOP setting or live SMS delivery was changed or tested in this follow-up.
- Resend sending and Trigger task execution are not represented as live-verified by these tests.
- Credential matching and deterministic hazard detection are bounded safeguards, not universal semantic detection of every secret or hazard in arbitrary prose.
- The guest-safe registry projection is an explicit allowlist, not blanket access to every Brain field.
- No historical graph cleanup, migration-history repair, billing change, or new third-party service activation is included.
