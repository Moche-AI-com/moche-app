# AI routing follow-up validation

Synthetic/offline verification only. No live provider sends, hosted database writes or Twilio changes are represented here.

## Unit tests

```text
> moche-app@0.1.0 test
> vitest run


 RUN  v3.2.7 /home/user/workspace/moche-app

 ✓ lib/router/transport-safety.test.ts (43 tests) 780ms
 ✓ lib/storage/cover-resize.test.ts (7 tests) 785ms
 ✓ lib/router/rebase-integration.test.ts (21 tests) 238ms
stderr | lib/router/modelRouter.test.ts > routedCompletion > with NO key: extraction fails closed without a cheap provider
{"level":"warn","msg":"ai_completion","meta":{"task":"extraction","outcome":"failed","latencyMs":0,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:22.749Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > with NO key: brain_ops fails closed without a cheap provider
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","outcome":"failed","latencyMs":0,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:22.761Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > with NO key: concierge_complex fails closed without a cheap provider
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","outcome":"failed","latencyMs":0,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:22.770Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > with key + extraction: routes to the strong tier with hardened ZDR
{"level":"info","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"success","latencyMs":2},"ts":"2026-10-04T01:08:22.781Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > sends no lower-tier fallback chain for extraction
{"level":"info","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.793Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > routes brain_ops to the strong tier with no lower-tier fallback chain
{"level":"info","msg":"ai_completion","meta":{"task":"brain_ops","model":"openai/gpt-4o","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.801Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > with key + classification: routes to the llama tier
{"level":"info","msg":"ai_completion","meta":{"task":"classification","model":"meta-llama/llama-3.1-8b-instruct","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.808Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > with key + general (default task): routes to gpt-4o-mini
{"level":"info","msg":"ai_completion","meta":{"task":"general","model":"openai/gpt-4o-mini","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.815Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > with key + concierge enabled: routes to the concierge tier
{"level":"info","msg":"ai_completion","meta":{"task":"concierge","model":"google/gemini-2.5-flash","outcome":"success","latencyMs":1},"ts":"2026-10-04T01:08:22.832Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > sends an ordered models[] chain so OpenRouter can fail over in-router
{"level":"info","msg":"ai_completion","meta":{"task":"concierge","model":"google/gemini-2.5-flash","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.840Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > builds the concierge chain from the reviewed allowlist, in order, without duplicates
{"level":"info","msg":"ai_completion","meta":{"task":"concierge","model":"openai/gpt-4o-mini","outcome":"success","latencyMs":1},"ts":"2026-10-04T01:08:22.849Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > refuses the external guest route when the allowlist is empty
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge","outcome":"failed","latencyMs":0,"code":"provider_ineligible"},"ts":"2026-10-04T01:08:22.856Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > extraction issues no request or weak fallback when no provider is reviewed
{"level":"warn","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"provider_ineligible"},"ts":"2026-10-04T01:08:22.866Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > brain_ops issues no request or weak fallback when no provider is reviewed
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"provider_ineligible"},"ts":"2026-10-04T01:08:22.875Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > concierge_complex issues no request or weak fallback when no provider is reviewed
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"provider_ineligible"},"ts":"2026-10-04T01:08:22.882Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > always pins `only` on the outbound request
{"level":"info","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.893Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > never sends a duplicate slug when a per-tier override equals a fallback
{"level":"info","msg":"ai_completion","meta":{"task":"general","model":"google/gemini-2.5-flash","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.901Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > honors a per-tier env override
{"level":"info","msg":"ai_completion","meta":{"task":"extraction","model":"custom/extract-v2","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.911Z"}

stdout | lib/router/modelRouter.test.ts > routedCompletion > redacts message content before it leaves our infra
{"level":"info","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:22.921Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > extraction fails closed on a non-2xx response
{"level":"warn","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_http_error"},"ts":"2026-10-04T01:08:22.928Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > brain_ops fails closed on a non-2xx response
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_http_error"},"ts":"2026-10-04T01:08:22.938Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > concierge_complex fails closed on a non-2xx response
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_http_error"},"ts":"2026-10-04T01:08:22.948Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > extraction fails closed on a network error
{"level":"warn","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_unavailable"},"ts":"2026-10-04T01:08:22.956Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > brain_ops fails closed on a network error
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_unavailable"},"ts":"2026-10-04T01:08:22.964Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > concierge_complex fails closed on a network error
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_unavailable"},"ts":"2026-10-04T01:08:22.973Z"}

 ✓ lib/router/modelRouter.test.ts (43 tests) 251ms
stderr | lib/router/modelRouter.failover.test.ts > routedCompletion independent outage hops > routes a retryable general-task outage to Ollama rather than AI_BASE_URL
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"general","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:23.177Z"}

stderr | lib/router/modelRouter.failover.test.ts > routedCompletion independent outage hops > reaches direct OpenAI after independent Ollama 503
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"classification","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:23.190Z"}

stderr | lib/router/modelRouter.failover.test.ts > routedCompletion independent outage hops > reaches direct OpenAI after independent Ollama 503
{"level":"warn","msg":"ai_failover_unavailable","meta":{"task":"classification","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:23.191Z"}
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"classification","provider":"openai-direct","reason":"upstream"},"ts":"2026-10-04T01:08:23.191Z"}

stderr | lib/router/modelRouter.failover.test.ts > routedCompletion independent outage hops > never hops on gateway authentication refusal
{"level":"warn","msg":"ai_completion","meta":{"task":"general","model":"openai/gpt-4o-mini","outcome":"failed","latencyMs":0,"code":"ai_http_error"},"ts":"2026-10-04T01:08:23.202Z"}

stderr | lib/router/modelRouter.failover.test.ts > routedCompletion independent outage hops > does not downgrade strong Brain work on a 503
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_http_error"},"ts":"2026-10-04T01:08:23.213Z"}

 ✓ lib/router/modelRouter.failover.test.ts (4 tests) 86ms
 ✓ test/learned-proposal-review.test.ts (47 tests) 74ms
stderr | lib/guest/approved-context.test.ts > guest approved-context boundary > hands off safely on embedding failure
{"level":"warn","msg":"concierge_unavailable","meta":{"code":"grounding_unavailable"},"ts":"2026-10-04T01:08:23.903Z"}

stderr | lib/guest/approved-context.test.ts > guest approved-context boundary > hands off safely on retrieval failure
{"level":"warn","msg":"concierge_unavailable","meta":{"code":"grounding_unavailable"},"ts":"2026-10-04T01:08:23.905Z"}

stderr | lib/guest/approved-context.test.ts > guest approved-context boundary > hands off safely on generation failure
{"level":"warn","msg":"generate_failed","meta":{"code":"completion_unavailable"},"ts":"2026-10-04T01:08:23.905Z"}

 ✓ lib/guest/approved-context.test.ts (35 tests) 37ms
 ✓ test/service-request-interview-routes.test.ts (23 tests) 38ms
stderr | lib/auth/guards.test.ts > requireFounder > returns the context unchanged when isFounder is true
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715

 ✓ lib/auth/guards.test.ts (5 tests) 116ms
 ✓ test/messaging-runtime-config.test.ts (3 tests) 130ms
 ✓ lib/queue/pipeline.test.ts (56 tests) 83ms
stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > makes no external call when guest routing is opted out
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","outcome":"failed","latencyMs":0,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:25.339Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > makes no external call when guest routing is opted out
{"level":"warn","msg":"escalation_translation_failed","meta":{"from":"Spanish","to":"English","code":"unavailable"},"ts":"2026-10-04T01:08:25.340Z"}

stdout | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > routes safety-sensitive translation with one strong model and privacy restrictions
{"level":"info","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"success","latencyMs":2},"ts":"2026-10-04T01:08:25.355Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > cannot bypass guest opt-out using OpenRouter through the alternate AI endpoint
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","outcome":"failed","latencyMs":0,"code":"ai_policy_refused"},"ts":"2026-10-04T01:08:25.372Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > cannot bypass guest opt-out using OpenRouter through the alternate AI endpoint
{"level":"warn","msg":"escalation_translation_failed","meta":{"from":"Spanish","to":"English","code":"unavailable"},"ts":"2026-10-04T01:08:25.372Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > retains the original without cheaper fallback on timeout
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":2,"code":"ai_unavailable"},"ts":"2026-10-04T01:08:25.382Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > retains the original without cheaper fallback on timeout
{"level":"warn","msg":"escalation_translation_failed","meta":{"from":"Spanish","to":"English","code":"unavailable"},"ts":"2026-10-04T01:08:25.383Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > retains the original without cheaper fallback on malformed
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_invalid_response"},"ts":"2026-10-04T01:08:25.392Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > retains the original without cheaper fallback on malformed
{"level":"warn","msg":"escalation_translation_failed","meta":{"from":"Spanish","to":"English","code":"unavailable"},"ts":"2026-10-04T01:08:25.393Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > retains the original without cheaper fallback on empty
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_invalid_response"},"ts":"2026-10-04T01:08:25.402Z"}

stderr | lib/guest/translate-routing.test.ts > translation crosses only an eligible protected guest route > retains the original without cheaper fallback on empty
{"level":"warn","msg":"escalation_translation_failed","meta":{"from":"Spanish","to":"English","code":"unavailable"},"ts":"2026-10-04T01:08:25.403Z"}

 ✓ lib/guest/translate-routing.test.ts (6 tests) 94ms
stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > brain_ops fails closed on provider failure
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","model":"openai/gpt-4o","outcome":"failed","latencyMs":3,"code":"ai_http_error"},"ts":"2026-10-04T01:08:25.575Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > brain_ops cannot use the development/general provider without configuration
{"level":"warn","msg":"ai_completion","meta":{"task":"brain_ops","outcome":"failed","latencyMs":1,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:25.589Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > extraction fails closed on provider failure
{"level":"warn","msg":"ai_completion","meta":{"task":"extraction","model":"openai/gpt-4o","outcome":"failed","latencyMs":2,"code":"ai_http_error"},"ts":"2026-10-04T01:08:25.600Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > extraction cannot use the development/general provider without configuration
{"level":"warn","msg":"ai_completion","meta":{"task":"extraction","outcome":"failed","latencyMs":0,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:25.607Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > concierge_complex fails closed on provider failure
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"failed","latencyMs":0,"code":"ai_http_error"},"ts":"2026-10-04T01:08:25.618Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > concierge_complex cannot use the development/general provider without configuration
{"level":"warn","msg":"ai_completion","meta":{"task":"concierge_complex","outcome":"failed","latencyMs":0,"code":"ai_not_configured"},"ts":"2026-10-04T01:08:25.632Z"}

stdout | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > uses a dedicated strong tier for complex guests, not the routine allowlist
{"level":"info","msg":"ai_completion","meta":{"task":"concierge_complex","model":"openai/gpt-4o","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:25.641Z"}

stdout | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > uses the strong model on the configured direct endpoint without an OpenRouter key
{"level":"info","msg":"ai_completion","meta":{"task":"brain_ops","model":"gpt-4o","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:25.650Z"}

 ✓ lib/router/reliability.test.ts (8 tests) 100ms
 ✓ test/messaging-recovery.test.ts (43 tests) 64ms
 ✓ test/integration-send-safety.test.ts (6 tests) 70ms
 ✓ test/escalation-learning-category.test.ts (9 tests) 27ms
 ✓ lib/local/distance.test.ts (14 tests) 48ms
 ✓ test/learned-proposal-editor.test.ts (6 tests) 37ms
stdout | lib/evals/golden.test.ts > gate summary > reports pass rate per archetype
urban_studio_no_parking: 204/204 (100.0%)
offgrid_cabin_no_wifi: 204/204 (100.0%)
multistory_beach_house: 204/204 (100.0%)

 ✓ lib/evals/golden.test.ts (24 tests) 39ms
 ✓ test/messaging-notifications.test.ts (19 tests) 41ms
 ✓ test/notification-escalations.test.ts (14 tests) 36ms
 ✓ test/brain-save-caller-warnings.test.ts (15 tests) 48ms
stderr | test/brain-indexing-outcomes.test.ts > manual source save and indexing outcomes > reports durable source saved but unavailable indexing and scopes failure status
{"level":"warn","msg":"brain_index_failed","meta":{"itemId":"***00-0000-4000-8000-***01","code":"indexing_unavailable"},"ts":"2026-10-04T01:08:28.693Z"}

stderr | test/brain-indexing-outcomes.test.ts > manual source save and indexing outcomes > reports durable source saved but unavailable indexing and scopes failure status
{"level":"warn","msg":"brain_index_failed","meta":{"itemId":"***00-0000-4000-8000-***01","code":"indexing_unavailable"},"ts":"2026-10-04T01:08:28.696Z"}

stderr | test/brain-indexing-outcomes.test.ts > manual source save and indexing outcomes > reports failed chunk persistence instead of indexed success
{"level":"warn","msg":"brain_index_failed","meta":{"itemId":"item-a","code":"indexing_unavailable"},"ts":"2026-10-04T01:08:28.698Z"}

stderr | test/brain-indexing-outcomes.test.ts > manual source save and indexing outcomes > rejects embedding batch mismatch rather than inserting undefined vectors
{"level":"warn","msg":"brain_index_failed","meta":{"itemId":"item-a","code":"indexing_unavailable"},"ts":"2026-10-04T01:08:28.699Z"}

 ✓ test/brain-indexing-outcomes.test.ts (8 tests) 31ms
 ✓ test/brain-save-wifi.test.ts (7 tests) 29ms
 ✓ test/trigger-app-route.test.ts (6 tests) 29ms
 ✓ test/notification-deliveries.test.ts (9 tests) 29ms
 ✓ test/messaging-routes.test.ts (17 tests) 30ms
 ✓ lib/dashboard/plan-banner.test.ts (23 tests) 18ms
 ✓ lib/guest/concierge-local-visibility.test.ts (9 tests) 28ms
 ✓ lib/ai/ollama-cloud.test.ts (5 tests) 25ms
stderr | test/brain-indexing-failure.test.ts > Brain indexing failure > reports a saved but unindexed item when embedding returns 401
{"level":"warn","msg":"brain_index_failed","meta":{"itemId":"new-item","code":"indexing_unavailable"},"ts":"2026-10-04T01:08:30.489Z"}

 ✓ test/brain-indexing-failure.test.ts (1 test) 24ms
 ✓ test/reports-indexing-outcomes.test.ts (9 tests) 27ms
 ✓ test/brain-improve-wifi.test.ts (3 tests) 24ms
 ✓ lib/ai/openai-direct.test.ts (4 tests) 25ms
 ✓ test/notify-urgent.test.ts (2 tests) 23ms
 ✓ lib/guest/concierge-routing.test.ts (19 tests) 24ms
 ✓ test/integration-readiness.test.ts (24 tests) 22ms
 ✓ test/local-recs-flows.test.ts (17 tests) 22ms
 ✓ test/knowledge-ingest-routing.test.ts (9 tests) 23ms
 ✓ test/messaging-phone-proof.test.ts (7 tests) 21ms
 ✓ lib/guest/history.test.ts (20 tests) 21ms
 ✓ test/preview-endpoints.test.ts (10 tests) 20ms
 ✓ lib/guest/extras.test.ts (42 tests) 18ms
 ✓ lib/guest/wifi-instructions.test.ts (37 tests) 18ms
 ✓ lib/brain/legacy-migration.test.ts (15 tests) 16ms
 ✓ test/ical-sync-route.test.ts (4 tests) 18ms
 ✓ lib/retrieval/ordering-divergence.test.ts (20 tests) 10ms
 ✓ lib/service-requests/share-report.test.ts (9 tests) 18ms
 ✓ test/guest-concierge-history-safety.test.ts (7 tests) 19ms
 ✓ lib/guest/service-request-interview.test.ts (28 tests) 17ms
 ✓ lib/concierge/tone.test.ts (35 tests) 10ms
 ✓ lib/local/merge.test.ts (35 tests) 17ms
 ✓ lib/brain/wifi-legacy-migration.test.ts (2 tests) 16ms
 ✓ test/guest-ai-outage.test.ts (2 tests) 15ms
 ✓ lib/brain/guest-answer-learning.test.ts (7 tests) 14ms
stderr | lib/router/outageFallback.test.ts > task-scoped independent outage fallback > uses Ollama for routine text after an eligible outage and redacts PII
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"classification","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:36.023Z"}

stderr | lib/router/outageFallback.test.ts > task-scoped independent outage fallback > uses direct OpenAI only when Ollama is absent or retryably unavailable
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"general","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:36.025Z"}

stderr | lib/router/outageFallback.test.ts > task-scoped independent outage fallback > uses direct OpenAI only when Ollama is absent or retryably unavailable
{"level":"warn","msg":"ai_failover_unavailable","meta":{"task":"general","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:36.026Z"}
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"general","provider":"openai-direct","reason":"upstream"},"ts":"2026-10-04T01:08:36.026Z"}

stderr | lib/router/outageFallback.test.ts > task-scoped independent outage fallback > does not reinterpret Ollama authentication failure as an outage
{"level":"warn","msg":"ai_failover_attempt","meta":{"task":"general","provider":"ollama-cloud","reason":"upstream"},"ts":"2026-10-04T01:08:36.027Z"}

 ✓ lib/router/outageFallback.test.ts (10 tests) 15ms
 ✓ lib/brain/coverage.test.ts (13 tests) 12ms
 ✓ lib/brain/proposals.test.ts (41 tests) 13ms
 ✓ test/notification-preferences.test.ts (18 tests) 7ms
 ✓ lib/normalizer/wifi-safety.test.ts (5 tests) 10ms
 ✓ test/concierge-credential-pipeline.test.ts (10 tests) 16ms
 ✓ lib/net/ssrf.test.ts (15 tests) 12ms
 ✓ test/brain-page-structure.test.ts (19 tests) 6ms
stdout | lib/billing/quantity-sync.test.ts > syncBillableQuantity > normalizes legacy per-property subscriptions to quantity one without proration
{"level":"info","msg":"quantity_sync_updated","meta":{"subscriptionId":"sub_1","from":4,"to":1},"ts":"2026-10-04T01:08:37.452Z"}

stderr | lib/billing/quantity-sync.test.ts > syncBillableQuantity > swallows a subscription read error
{"level":"warn","msg":"quantity_sync_subscription_read_failed","meta":{"error":"db down"},"ts":"2026-10-04T01:08:37.456Z"}

 ✓ lib/billing/quantity-sync.test.ts (16 tests) 11ms
 ✓ test/guest-chat-history-window.test.ts (7 tests) 11ms
 ✓ lib/billing/entitlements.test.ts (32 tests) 10ms
 ✓ lib/property-import/jobs-routing.test.ts (6 tests) 10ms
 ✓ lib/env-sms.test.ts (7 tests) 11ms
 ✓ lib/guest/party-strings.test.ts (4 tests) 11ms
 ✓ lib/property-import/extract.test.ts (19 tests) 11ms
stdout | lib/ai/openai-embedding-routing.test.ts > embedding provider routing > keeps the direct embedding route by default
{"level":"info","msg":"ai_embedding","meta":{"task":"embedding","model":"text-embedding-3-small","outcome":"success","latencyMs":3},"ts":"2026-10-04T01:08:38.657Z"}

stdout | lib/ai/openai-embedding-routing.test.ts > embedding provider routing > uses OpenRouter only when explicitly opted in, without changing chat
{"level":"info","msg":"ai_embedding","meta":{"task":"embedding","model":"openai/text-embedding-3-small","outcome":"success","latencyMs":0},"ts":"2026-10-04T01:08:38.660Z"}

stderr | lib/ai/openai-embedding-routing.test.ts > embedding provider routing > refuses to send a request when the router key is absent
{"level":"warn","msg":"ai_embedding","meta":{"task":"embedding","outcome":"failed","code":"ai_not_configured","latencyMs":0},"ts":"2026-10-04T01:08:38.663Z"}

 ✓ lib/ai/openai-embedding-routing.test.ts (3 tests) 14ms
 ✓ lib/brain/redact.test.ts (36 tests) 11ms
 ✓ lib/brain/completeness.test.ts (27 tests) 10ms
 ✓ test/messaging-readiness.test.ts (18 tests) 8ms
 ✓ lib/local/ranking.test.ts (4 tests) 10ms
 ✓ lib/crypto.visit-code.test.ts (8 tests) 9ms
 ✓ lib/router/jevDecisions.test.ts (5 tests) 10ms
 ✓ lib/local/validation.test.ts (15 tests) 10ms
 ✓ lib/dashboard/profile-nav.test.ts (14 tests) 8ms
 ✓ test/release-property-brain.test.ts (8 tests) 14ms
 ✓ lib/guest/languages.test.ts (18 tests) 9ms
 ✓ lib/ai/ollama.test.ts (9 tests) 8ms
 ✓ lib/local/search.test.ts (26 tests) 10ms
 ✓ lib/ai/redaction.test.ts (28 tests) 9ms
 ✓ test/notification-ack.test.ts (7 tests) 5ms
 ✓ lib/guest/push.test.ts (5 tests) 8ms
 ✓ lib/brain/wifi-registry.test.ts (4 tests) 8ms
 ✓ lib/normalizer/index.test.ts (2 tests) 8ms
 ✓ lib/design/palette.test.ts (57 tests) 9ms
 ✓ lib/appliances/guidance.test.ts (4 tests) 8ms
 ✓ lib/guest/behavioral-triggers.test.ts (9 tests) 8ms
 ✓ lib/storage/cover-image.test.ts (19 tests) 9ms
 ✓ lib/guest/linkify.test.ts (16 tests) 8ms
 ✓ lib/billing/meters.test.ts (9 tests) 7ms
 ✓ lib/guest/credential-questions.test.ts (28 tests) 7ms
stderr | lib/billing/founding.test.ts > isFoundingCouponRedeemable > degrades to full price instead of throwing when the lookup fails
{"level":"warn","msg":"founding_coupon_lookup_failed","meta":{"couponId":"founding-host-50-12mo","error":"stripe unreachable"},"ts":"2026-10-04T01:08:43.045Z"}

stderr | lib/billing/founding.test.ts > isFoundingCouponRedeemable > does not rethrow a non-Error rejection
{"level":"warn","msg":"founding_coupon_lookup_failed","meta":{"couponId":"founding-host-50-12mo","error":"string failure"},"ts":"2026-10-04T01:08:43.046Z"}

 ✓ lib/billing/founding.test.ts (13 tests) 8ms
 ✓ lib/local/nearby.test.ts (6 tests) 7ms
 ✓ lib/brain/values.test.ts (11 tests) 7ms
stderr | lib/properties/purge.test.ts
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715

 ✓ lib/properties/purge.test.ts (11 tests) 7ms
 ✓ lib/dashboard/extras-orders.test.ts (15 tests) 7ms
 ✓ lib/notifications/urgency.test.ts (23 tests) 7ms
 ✓ lib/brain/setup-autofill.test.ts (8 tests) 7ms
 ✓ lib/guest/translate.test.ts (15 tests) 7ms
 ✓ lib/brain/taxonomy.test.ts (15 tests) 7ms
 ✓ lib/acquisition/audit.test.ts (5 tests) 7ms
 ✓ lib/dashboard/breadcrumbs.test.ts (14 tests) 7ms
 ✓ lib/guest/concierge.test.ts (14 tests) 6ms
 ✓ test/messaging-escalation-actions.test.ts (4 tests) 7ms
 ✓ lib/router/providerAllowlist.test.ts (17 tests) 6ms
stderr | lib/rate-limit.test.ts > checkRateLimit > fails open on a counter read error
{"level":"warn","msg":"rate_limit_count_failed","meta":{"action":"test","error":"db down"},"ts":"2026-10-04T01:08:45.581Z"}

 ✓ lib/rate-limit.test.ts (4 tests) 6ms
 ✓ lib/guest/card-copy.test.ts (3 tests) 6ms
 ✓ lib/brain/autopilot.test.ts (13 tests) 6ms
 ✓ lib/guest/party-invite.test.ts (9 tests) 7ms
 ✓ lib/local/mapbox.test.ts (4 tests) 6ms
 ✓ test/messaging-login-deeplink.test.ts (1 test) 6ms
 ✓ lib/ingest/segment.test.ts (9 tests) 6ms
 ✓ lib/ingest/standardize.test.ts (7 tests) 6ms
 ✓ lib/brain/freshness.test.ts (12 tests) 6ms
 ✓ lib/brain/readiness.test.ts (7 tests) 6ms
 ✓ lib/dashboard/knowledge-queue-link.test.ts (9 tests) 4ms
 ✓ lib/guest/history-replay.test.ts (4 tests) 6ms
 ✓ trigger/ping.test.ts (5 tests) 5ms
 ✓ lib/auth/member-capabilities.test.ts (6 tests) 5ms
 ✓ lib/ingest/sensitivity.test.ts (6 tests) 4ms
 ✓ test/guest-portal-a11y.test.ts (9 tests) 5ms
 ✓ lib/local/recovery.test.ts (6 tests) 5ms
 ✓ lib/ical/parse.test.ts (6 tests) 5ms
 ✓ lib/auth/roles.test.ts (10 tests) 5ms
 ✓ lib/guest/appliance-answer.test.ts (2 tests) 5ms
 ✓ test/extras-request-number.test.ts (3 tests) 5ms
 ✓ lib/dashboard/nav-active.test.ts (9 tests) 5ms
 ✓ test/property-workspace.test.ts (5 tests) 4ms
 ✓ test/extras-lifecycle.test.ts (4 tests) 4ms
 ✓ lib/property-import/pasted.test.ts (4 tests) 4ms
 ✓ lib/brain/one-off.test.ts (3 tests) 4ms
 ✓ test/pricing-intent-flow.test.ts (5 tests) 4ms
 ✓ lib/validation.signup.test.ts (3 tests) 4ms
 ✓ lib/local/curation.test.ts (8 tests) 4ms
 ✓ lib/local/dedupe.test.ts (7 tests) 4ms
 ✓ lib/acquisition/retention-boundary.test.ts (1 test) 4ms
 ✓ lib/brain/property-workspace-summary.test.ts (4 tests) 4ms
 ✓ test/trigger-clock-only.test.ts (5 tests) 3ms
 ✓ lib/property-import/appliance-safety.test.ts (2 tests) 4ms
 ✓ lib/billing/pricing-v2-price-map.test.ts (7 tests) 3ms
 ✓ lib/notifications/phone.test.ts (3 tests) 3ms
 ✓ test/messaging-ui-contract.test.ts (4 tests) 3ms
 ✓ test/extras-migration-policy.test.ts (3 tests) 3ms
 ✓ lib/storage/s3.test.ts (5 tests) 4ms
 ✓ test/dashboard-scope.test.ts (4 tests) 3ms
 ✓ lib/billing/usage.test.ts (4 tests) 4ms
 ✓ lib/property-import/attestation.test.ts (7 tests) 3ms
 ✓ lib/notifications/delivery-outcome.test.ts (3 tests) 3ms
 ✓ lib/guest/email-alerts-core.test.ts (4 tests) 3ms
 ✓ test/breadcrumbs.test.ts (4 tests) 3ms
 ✓ lib/dashboard/lifecycle.test.ts (7 tests) 3ms
 ✓ lib/property-import/migrations.test.ts (2 tests) 3ms
 ✓ lib/mail/senders.test.ts (5 tests) 3ms
 ✓ lib/billing/demo-guest-ai.test.ts (4 tests) 3ms
 ✓ test/acquisition-migration.test.ts (3 tests) 3ms
 ✓ lib/design/form-contrast.test.ts (3 tests) 3ms
 ✓ lib/env.test.ts (5 tests) 3ms
 ✓ test/wifi-registry-migration.test.ts (2 tests) 3ms
 ✓ lib/local/canonical.test.ts (2 tests) 3ms
 ✓ test/dashboard-cards.test.ts (2 tests) 3ms
 ✓ test/guest-portal-theme-mobile.test.ts (2 tests) 2ms
 ✓ test/service-request-lifecycle.test.ts (2 tests) 3ms
 ✓ lib/storage/s3.unconfigured.test.ts (2 tests) 3ms
 ✓ test/stay-portal-status.test.ts (4 tests) 2ms
 ✓ test/escalation-inbox-routes.test.ts (2 tests) 2ms
 ✓ lib/dashboard/escalations-permissions.test.ts (3 tests) 2ms
 ✓ test/billing-page-pricing-v2.test.ts (2 tests) 2ms
 ✓ lib/notifications/host-reachability.test.ts (2 tests) 2ms

 Test Files  172 passed (172)
      Tests  1972 passed (1972)
   Start at  01:08:19
   Duration  36.22s (transform 2.22s, setup 0ms, collect 6.40s, tests 4.66s, environment 25ms, prepare 9.01s)
```

## Lint

```text
> moche-app@0.1.0 lint
> eslint .


/home/user/workspace/moche-app/app/dashboard/DashboardOverview.tsx
  69:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/DashboardOverview.tsx:69:7
  67 |   useEffect(() => {
  68 |     if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
> 69 |       setValue(target);
     |       ^^^^^^^^ Avoid calling setState() directly within an effect
  70 |       return;
  71 |     }
  72 |     let raf = 0;  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/page.tsx
  74:27  warning  Error: Cannot call impure function during render

`Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render. (https://react.dev/reference/rules/components-and-hooks-must-be-pure#components-and-hooks-must-be-idempotent).

/home/user/workspace/moche-app/app/dashboard/page.tsx:74:27
  72 |   let nextArrival: { guestName: string; propertyName: string | null; checkIn: string } | null = null;
  73 |   if (propertyIds.length > 0) {
> 74 |     const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
     |                           ^^^^^^^^^^ Cannot call impure function
  75 |     const [{ count: stayCount }, { data: brainItems }, { data: arrivals }] = await Promise.all([
  76 |       supabase.from('stays').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('status', 'active'),
  77 |       supabase.from('brain_items').select('category, status, deleted_at, visibility, property_id').in('property_id', propertyIds),  react-hooks/purity

/home/user/workspace/moche-app/app/dashboard/profile/SecurityForms.tsx
  39:29  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/profile/SecurityForms.tsx:39:29
  37 |   // Advance to the code step once a code has been dispatched.
  38 |   useEffect(() => {
> 39 |     if (sendState.codeSent) setStep('code');
     |                             ^^^^^^^ Avoid calling setState() directly within an effect
  40 |   }, [sendState.codeSent]);
  41 |   // Reset back to the phone step after a successful verification.
  42 |   useEffect(() => {  react-hooks/set-state-in-effect
  43:30  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/profile/SecurityForms.tsx:43:30
  41 |   // Reset back to the phone step after a successful verification.
  42 |   useEffect(() => {
> 43 |     if (verifyState.success) setStep('phone');
     |                              ^^^^^^^ Avoid calling setState() directly within an effect
  44 |   }, [verifyState.success]);
  45 |
  46 |   return (                                                                      react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/profile/billing/BillingActions.tsx
  178:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/profile/billing/BillingActions.tsx:178:5
  176 |   useEffect(() => {
  177 |     if (!open || elig || loading) return;
> 178 |     setLoading(true);
      |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
  179 |     fetch('/api/stripe/refund', { method: 'GET' })
  180 |       .then(async (res) => {
  181 |         const data = (await res.json()) as Eligibility & { error?: string };  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/profile/user-management/UserManagementClient.tsx
  588:30  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/profile/user-management/UserManagementClient.tsx:588:30
  586 |   // save, including two identical saves in a row.
  587 |   useEffect(() => {
> 588 |     if (updateState.success) setEditing(false);
      |                              ^^^^^^^^^^ Avoid calling setState() directly within an effect
  589 |   }, [updateState]);
  590 |
  591 |   const editorId = `member-editor-${member.profileId}`;  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/DangerZone.tsx
  41:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/DangerZone.tsx:41:10
  39 |   useEffect(() => {
  40 |     if (open) inputRef.current?.focus();
> 41 |     else setTyped('');
     |          ^^^^^^^^ Avoid calling setState() directly within an effect
  42 |   }, [open]);
  43 |
  44 |   useEffect(() => {  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/appliances/AppliancePrefillPanel.tsx
  45:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/appliances/AppliancePrefillPanel.tsx:45:7
  43 |   useEffect(() => {
  44 |     if (suggestion.draft && requestedId === selected) {
> 45 |       setGuidance(suggestion.draft.guestGuidance);
     |       ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  46 |       setActiveDraftId(selected);
  47 |     }
  48 |   }, [suggestion, requestedId, selected]);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/appliances/CatalogSearch.tsx
  45:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/appliances/CatalogSearch.tsx:45:7
  43 |   useEffect(() => {
  44 |     if (q.trim().length < 2) {
> 45 |       setHits([]);
     |       ^^^^^^^ Avoid calling setState() directly within an effect
  46 |       setSearching(false);
  47 |       return;
  48 |     }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/ApplianceEntryPlacement.tsx
  32:25  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/ApplianceEntryPlacement.tsx:32:25
  30 |
  31 |   useEffect(() => {
> 32 |     if (!isBrainHome) { setSlot(null); return; }
     |                         ^^^^^^^ Avoid calling setState() directly within an effect
  33 |     let container: HTMLDivElement | null = null;
  34 |     const position = () => {
  35 |       const empty = document.getElementById('brain-empty-sections');  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/BrainManager.tsx
  174:5   warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/BrainManager.tsx:174:5
  172 |     if (!canEdit || !editItemId) return;
  173 |     if (!items.some((i) => i.id === editItemId)) return;
> 174 |     setEditingId(editItemId);
      |     ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  175 |     const t = setTimeout(() => {
  176 |       document
  177 |         .getElementById(`brain-item-${editItemId}`)                                                                                                                                    react-hooks/set-state-in-effect
  482:23  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/BrainManager.tsx:482:23
  480 |     // A saved source can still fail indexing. Retain its ID even if a later
  481 |     // retry fails before returning an ID, so retry updates rather than duplicates.
> 482 |     if (state.itemId) setSavedItemId(state.itemId);
      |                       ^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  483 |     if (state.ok && !state.warning && !state.error && !completed.current) {
  484 |       completed.current = true;
  485 |       onDone();  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/EnhanceBrainPanel.tsx
  141:23  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/EnhanceBrainPanel.tsx:141:23
  139 |   // Advance once, only when both saving and indexing completed successfully.
  140 |   useEffect(() => {
> 141 |     if (state.itemId) setSavedItemId(state.itemId);
      |                       ^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  142 |     if (state.ok && !state.warning && !state.error && !completed.current) {
  143 |       completed.current = true;
  144 |       onSaved();  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/FeaturesPanel.tsx
  126:15  warning  Unused eslint-disable directive (no problems were reported from 'jsx-a11y/no-autofocus')
  260:44  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/FeaturesPanel.tsx:260:44
  258 |   if (saveState.ok) queueMicrotask(onDone);
  259 |   useEffect(() => {
> 260 |     if (draftState.ok && draftState.draft) setNotes(draftState.draft);
      |                                            ^^^^^^^^ Avoid calling setState() directly within an effect
  261 |   }, [draftState]);
  262 |
  263 |   const uid = feature ? `edit-${feature.id}` : 'new';  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/add/AddKnowledgeClient.tsx
  58:51  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/add/AddKnowledgeClient.tsx:58:51
  56 |   // Adopt a finished rewrite exactly once per result.
  57 |   useEffect(() => {
> 58 |     if (improveState.ok && improveState.improved) setBody(improveState.improved);
     |                                                   ^^^^^^^ Avoid calling setState() directly within an effect
  59 |   }, [improveState]);
  60 |
  61 |   const saved = saveState.ok === true && !saveState.warning;  react-hooks/set-state-in-effect
  63:27  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/add/AddKnowledgeClient.tsx:63:27
  61 |   const saved = saveState.ok === true && !saveState.warning;
  62 |   useEffect(() => {
> 63 |     if (saveState.itemId) setSavedItemId(saveState.itemId);
     |                           ^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  64 |     if (!saveState.ok || saveState.warning) return;
  65 |     setTitle('');
  66 |     setBody('');                               react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/GuestChatInbox.tsx
  112:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/GuestChatInbox.tsx:112:10
  110 |
  111 |   useEffect(() => {
> 112 |     void loadThreads();
      |          ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  113 |     const timer = window.setInterval(() => void loadThreads(), 8000);
  114 |     return () => window.clearInterval(timer);
  115 |   }, [loadThreads]);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/PartyInvitePanel.tsx
   78:26  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/PartyInvitePanel.tsx:78:26
  76 |   }, [linkUrl]);
  77 |
> 78 |   useEffect(() => { void load(); }, [load]);
     |                          ^^^^ Avoid calling setState() directly within an effect
  79 |
  80 |   async function send(url: string, method: 'PATCH' | 'DELETE', body?: unknown): Promise<boolean> {
  81 |     setBusy(true); setError(null); setNotice(null);  react-hooks/set-state-in-effect
  135:35  warning  Error: Cannot call impure function during render

`Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render. (https://react.dev/reference/rules/components-and-hooks-must-be-pure#components-and-hooks-must-be-idempotent).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/PartyInvitePanel.tsx:135:35
  133 |
  134 |   const latest = data.invites[0];
> 135 |   const status = statusOf(latest, Date.now());
      |                                   ^^^^^^^^^^ Cannot call impure function
  136 |   const live = status === 'active' || status === 'full';
  137 |   const used = latest?.redemption_count ?? 0;
  138 |   const defaultCap = Math.max(data.settings.maxJoins, data.guestCount);                                                                                                                                                                                                                                                                                                                                           react-hooks/purity

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/StayGuestsManager.tsx
  44:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/StayGuestsManager.tsx:44:5
  42 |
  43 |   useEffect(() => {
> 44 |     setError(null);
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  45 |     void loadGuests();
  46 |   }, [loadGuests]);
  47 |  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalPlaceForm.tsx
  39:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalPlaceForm.tsx:39:5
  37 |   useEffect(() => {
  38 |     if (pickedLocation?.target !== target) return;
> 39 |     setLat(pickedLocation.lat.toFixed(6));
     |     ^^^^^^ Avoid calling setState() directly within an effect
  40 |     setLng(pickedLocation.lng.toFixed(6));
  41 |     document.getElementById(`${prefix}-lat`)?.focus({ preventScroll: true });
  42 |   }, [pickedLocation, target, prefix]);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalPlaceManager.tsx
  28:64  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalPlaceManager.tsx:28:64
  26 | function PlaceEditor({ propertyId, place, pickedLocation, onPickLocation, selectedId }: EditorProps & { place: LocalPlaceRow }) {
  27 |   const [editing, setEditing] = useState(false);
> 28 |   useEffect(() => { if (selectedId === place.recommendationId) setEditing(true); }, [selectedId, place.recommendationId]);
     |                                                                ^^^^^^^^^^ Avoid calling setState() directly within an effect
  29 |   return (
  30 |     <article className="card" tabIndex={-1} style={{ marginBottom: '.75rem', padding: '1rem', scrollMarginTop: '1rem', overflowWrap: 'anywhere' }} id={`place-${place.recommendationId}`}>
  31 |       <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>  react-hooks/set-state-in-effect
  55:40  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalPlaceManager.tsx:55:40
  53 |   const [adding, setAdding] = useState(false);
  54 |   const [refreshState, refreshAction] = useFormState<LocalRefreshState, FormData>(refreshLocalPlacesAction, {});
> 55 |   useEffect(() => { if (manualRequest) setAdding(true); }, [manualRequest]);
     |                                        ^^^^^^^^^ Avoid calling setState() directly within an effect
  56 |   useEffect(() => {
  57 |     if (adding) document.getElementById('local-form-new-name')?.focus();
  58 |   }, [adding]);                                                                                                                                                                                                                                                                                                                         react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalSearch.tsx
  44:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/local/LocalSearch.tsx:44:5
  42 |     const id = ++requestId.current;
  43 |     onClear?.();
> 44 |     setResults([]);
     |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
  45 |     setNote(null);
  46 |     setError(null);
  47 |     if (trimmed.length < 2) {  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/stays/StaysManager.tsx
  245:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/stays/StaysManager.tsx:245:5
  243 |
  244 |   useEffect(() => {
> 245 |     setInvites([]);
      |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
  246 |     setError(null);
  247 |     setNotice(null);
  248 |     void loadInvites();  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/stays/[stayId]/conversations/[conversationId]/ConversationThread.tsx
  188:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/stays/[stayId]/conversations/[conversationId]/ConversationThread.tsx:188:10
  186 |
  187 |   useEffect(() => {
> 188 |     void load();
      |          ^^^^ Avoid calling setState() directly within an effect
  189 |     const timer = window.setInterval(() => void load(), 5000);
  190 |     return () => window.clearInterval(timer);
  191 |   }, [load]);                       react-hooks/set-state-in-effect
  213:7   warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/stays/[stayId]/conversations/[conversationId]/ConversationThread.tsx:213:7
  211 |     const message = messages.find((m) => m.escalationId === initialEscalationId);
  212 |     if (message) {
> 213 |       setReplyTo(message);
      |       ^^^^^^^^^^ Avoid calling setState() directly within an effect
  214 |     } else {
  215 |       setActiveEscalation(esc);
  216 |     }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/dashboard/properties/[id]/welcome-card/page.tsx
  33:30  warning  Error: Cannot call impure function during render

`Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render. (https://react.dev/reference/rules/components-and-hooks-must-be-pure#components-and-hooks-must-be-idempotent).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/welcome-card/page.tsx:33:30
  31 |   const token = generateSessionToken();
  32 |   const tokenHash = hashSessionToken(token);
> 33 |   const expiresAt = new Date(Date.now() + PROPERTY_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
     |                              ^^^^^^^^^^ Cannot call impure function
  34 |
  35 |   await admin.from('guest_access_links').insert({
  36 |     property_id: property.id,  react-hooks/purity

/home/user/workspace/moche-app/app/dashboard/properties/new/review/[jobId]/FeatureChecklist.tsx
  25:19  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/new/review/[jobId]/FeatureChecklist.tsx:25:19
  23 |
  24 |   useEffect(() => {
> 25 |     if (state.ok) setDone(true);
     |                   ^^^^^^^ Avoid calling setState() directly within an effect
  26 |   }, [state]);
  27 |
  28 |   const toggle = (key: string) =>  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/error.tsx
  8:5  warning  Unused eslint-disable directive (no problems were reported from 'no-console')

/home/user/workspace/moche-app/app/g/[slug]/AiChatWorkflow.tsx
   83:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    react-hooks/exhaustive-deps
   85:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/AiChatWorkflow.tsx:85:10
  83 |   }, [props.hostPreview, props.slug, props.onSessionExpired]);
  84 |   useEffect(() => {
> 85 |     void loadHistory();
     |          ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  86 |     if (props.hostPreview) return;
  87 |     const timer = window.setInterval(() => void loadHistory(), 8000);
  88 |     return () => window.clearInterval(timer);  react-hooks/set-state-in-effect
  102:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    react-hooks/exhaustive-deps

/home/user/workspace/moche-app/app/g/[slug]/EscalationFollowUp.tsx
  40:21  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/EscalationFollowUp.tsx:40:21
  38 |   const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  39 |   const [emailMsg, setEmailMsg] = useState<string | null>(null);
> 40 |   useEffect(() => { setPlatform(detectPlatform()); }, []);
     |                     ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  41 |
  42 |   async function submitEmail(event: FormEvent) {
  43 |     event.preventDefault();  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/ExtrasWorkflow.tsx
  83:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          react-hooks/exhaustive-deps
  85:51  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/ExtrasWorkflow.tsx:85:51
  83 |   }, [hostPreview, props.slug, props.onSessionExpired]);
  84 |
> 85 |   useEffect(() => { if (view === 'requests') void loadOrders(); }, [view, loadOrders]);
     |                                                   ^^^^^^^^^^ Avoid calling setState() directly within an effect
  86 |
  87 |   function openDetail(offer: GuestExtraOffer) {
  88 |     setSelected(offer); setVariant(null); setQuantity(1); setNote(''); setPreferredFor(''); setError(null); setView('detail');  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/GuestPortal.tsx
  43:48  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/GuestPortal.tsx:43:48
  41 |     try {
  42 |       const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
> 43 |       if (stored && resolveLanguage(stored)) { setLanguageState(stored); return; }
     |                                                ^^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  44 |       const browser = resolveLanguage(window.navigator.language);
  45 |       if (browser) setLanguageState(browser.code);
  46 |     } catch { /* Automatic remains available without local storage. */ }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/HostChatWorkflow.tsx
  121:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  react-hooks/exhaustive-deps
  125:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/HostChatWorkflow.tsx:125:10
  123 |   useEffect(() => {
  124 |     if (hostPreview) return;
> 125 |     void load();
      |          ^^^^ Avoid calling setState() directly within an effect
  126 |     const timer = window.setInterval(() => void load(), 5000);
  127 |     return () => window.clearInterval(timer);
  128 |   }, [load, hostPreview]);                                                                                                                                     react-hooks/set-state-in-effect
  136:9   warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/HostChatWorkflow.tsx:136:9
  134 |       const target = messages.find((m) => m.id === props.initialMessageId);
  135 |       if (target?.escalationId && !openCards[target.escalationId]) {
> 136 |         setOpenCards((cards) => ({ ...cards, [target.escalationId!]: true }));
      |         ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  137 |         return;
  138 |       }
  139 |       const el = document.getElementById(`message-${props.initialMessageId}`);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/LocalizedApplianceQuestions.tsx
  21:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/LocalizedApplianceQuestions.tsx:21:5
  19 |     if (props.hostPreview) return;
  20 |     const controller = new AbortController();
> 21 |     setError(false);
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  22 |     fetch(`/api/guest/${encodeURIComponent(props.slug)}/appliances/${encodeURIComponent(props.applianceId)}/questions?language=${encodeURIComponent(locale)}`, {
  23 |       cache: 'no-store', signal: controller.signal,
  24 |     }).then((res) => {  react-hooks/set-state-in-effect
  34:6  warning  React Hook useEffect has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useEffect call and refer to those specific props inside useEffect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              react-hooks/exhaustive-deps

/home/user/workspace/moche-app/app/g/[slug]/MainMenu.tsx
  30:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/MainMenu.tsx:30:5
  28 |     if (!selected) { try { selected = window.localStorage.getItem('gp-lang'); } catch { /* storage can be disabled */ } }
  29 |     const resolved = resolveLanguage(selected)?.code ?? null;
> 30 |     setRequested(resolved);
     |     ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  31 |     if (!resolved || PORTAL_STRING_LOCALES.includes(resolved.toLowerCase())) { setLoading(false); setFailed(false); return; }
  32 |     const slug = props.slug ?? window.location.pathname.split('/')[2];
  33 |     if (!slug) { setFailed(true); return; }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/MaintenanceWorkflow.tsx
  60:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/MaintenanceWorkflow.tsx:60:7
  58 |   useEffect(() => {
  59 |     if (hostPreview) {
> 60 |       setChecked(true);
     |       ^^^^^^^^^^ Avoid calling setState() directly within an effect
  61 |       return;
  62 |     }
  63 |     let cancelled = false;  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/join/JoinWithInvite.tsx
  32:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/join/JoinWithInvite.tsx:32:5
  30 |     let saved: string | null = null;
  31 |     try { saved = window.localStorage.getItem('gp-lang'); } catch { /* storage can be disabled */ }
> 32 |     setLanguage(saved && saved !== 'auto' ? saved : (navigator.language || null));
     |     ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  33 |     const found = readPartyTokenFromHash(window.location.hash);
  34 |     if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  35 |     setToken(found);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/local/LocalGuide.tsx
  153:9  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/local/LocalGuide.tsx:153:9
  151 |       const stored = window.localStorage.getItem('gp-lang');
  152 |       if (stored) {
> 153 |         setLanguage(stored);
      |         ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  154 |         return;
  155 |       }
  156 |       if (window.navigator.language) setLanguage(window.navigator.language);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/portalStyles.ts
  327:71  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/portalStyles.ts:327:71
  325 |   useEffect(() => {
  326 |     try {
> 327 |       if (window.localStorage.getItem(THEME_STORAGE_KEY) === 'light') setTheme('light');
      |                                                                       ^^^^^^^^ Avoid calling setState() directly within an effect
  328 |     } catch {
  329 |       // Private-browsing modes can throw; the dark default simply stays.
  330 |     }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/useLocalizedAssistantCards.ts
  17:23  warning  Error: Cannot access refs during render

React refs are values that are not needed for rendering. Refs should only be accessed outside of render, such as in event handlers or effects. Accessing a ref value (the `current` property) during render can cause your component not to update as expected (https://react.dev/reference/react/useRef).

/home/user/workspace/moche-app/app/g/[slug]/useLocalizedAssistantCards.ts:17:23
  15 |   const [error, setError] = useState(false);
  16 |   const [retryCount, setRetryCount] = useState(0);
> 17 |   const cachedCards = cache.current.get(cacheKey);
     |                       ^^^^^^^^^^^^^ Passing a ref to a function may read its value during render
  18 |   const cards = cachedCards ?? (result?.slug === slug ? result.cards : []);
  19 |
  20 |   useEffect(() => {                                                                                                                                                                                                                                                                                                                                                                                                                               react-hooks/refs
  17:23  warning  Error: Cannot access refs during render

React refs are values that are not needed for rendering. Refs should only be accessed outside of render, such as in event handlers or effects. Accessing a ref value (the `current` property) during render can cause your component not to update as expected (https://react.dev/reference/react/useRef).

/home/user/workspace/moche-app/app/g/[slug]/useLocalizedAssistantCards.ts:17:23
  15 |   const [error, setError] = useState(false);
  16 |   const [retryCount, setRetryCount] = useState(0);
> 17 |   const cachedCards = cache.current.get(cacheKey);
     |                       ^^^^^^^^^^^^^^^^^ Passing a ref to a function may read its value during render
  18 |   const cards = cachedCards ?? (result?.slug === slug ? result.cards : []);
  19 |
  20 |   useEffect(() => {                                                                                                                                                                                                                                                                                                                                                                                                                           react-hooks/refs
  22:24  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/useLocalizedAssistantCards.ts:22:24
  20 |   useEffect(() => {
  21 |     if (!enabled) return;
> 22 |     if (cachedCards) { setError(false); return; }
     |                        ^^^^^^^^ Avoid calling setState() directly within an effect
  23 |     const controller = new AbortController();
  24 |     setError(false);
  25 |     fetch(`/api/guest/${encodeURIComponent(slug)}/assistant-cards?language=${encodeURIComponent(locale)}`, { cache: 'no-store', signal: controller.signal })  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/legal/terms/page.tsx
  88:23  warning  Do not use an `<a>` element to navigate to `/`. Use `<Link />` from `next/link` instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages  @next/next/no-html-link-for-pages

/home/user/workspace/moche-app/app/providers.tsx
  43:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/providers.tsx:43:5
  41 |
  42 |   useEffect(() => {
> 43 |     setConsent(readConsent());
     |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
  44 |   }, []);
  45 |
  46 |   useEffect(() => {  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/welcome/ActivationJourney.tsx
  31:11  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/welcome/ActivationJourney.tsx:31:11
  29 |   useEffect(() => {
  30 |     if (!props.property) return;
> 31 |     try { setPreviewConfirmed(window.localStorage.getItem(`moche:activation:preview:${props.property.id}`) === '1'); } catch { /* Best effort. */ }
     |           ^^^^^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  32 |   }, [props.property]);
  33 |
  34 |   function confirmPreview() {  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/AddressAutocomplete.tsx
  94:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/AddressAutocomplete.tsx:94:7
  92 |     }
  93 |     if (q.length < 3) {
> 94 |       setSuggestions([]);
     |       ^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  95 |       setOpen(false);
  96 |       setNotice(null);
  97 |       return;  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/CookieConsent.tsx
  43:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/CookieConsent.tsx:43:5
  41 |
  42 |   useEffect(() => {
> 43 |     setVisible(readConsent() === null);
     |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
  44 |   }, []);
  45 |
  46 |   function decide(value: Consent) {  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/StaticMapPreview.tsx
  52:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/StaticMapPreview.tsx:52:7
  50 |   useEffect(() => {
  51 |     if (src !== srcKey) {
> 52 |       setSrcKey(src);
     |       ^^^^^^^^^ Avoid calling setState() directly within an effect
  53 |       setLoaded(false);
  54 |       setFailed(false);
  55 |     }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/ThemeToggle.tsx
  16:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/ThemeToggle.tsx:16:5
  14 |   useEffect(() => {
  15 |     const attr = document.documentElement.getAttribute('data-theme');
> 16 |     setTheme(attr === 'dark' ? 'dark' : 'light');
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  17 |   }, []);
  18 |
  19 |   function toggle() {  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/dashboard/Breadcrumbs.tsx
  32:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/dashboard/Breadcrumbs.tsx:32:7
  30 |     if (pathname !== firstPath) {
  31 |       navigatedInSession = true;
> 32 |       setCanGoBack(true);
     |       ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  33 |     }
  34 |   }, [pathname, firstPath]);
  35 |  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/dashboard/NotificationBell.tsx
  67:21  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/dashboard/NotificationBell.tsx:67:21
  65 |   // Re-sync from the server after revalidatePath pushes fresh props, otherwise
  66 |   // local state would keep serving a stale snapshot for the rest of the session.
> 67 |   useEffect(() => { setItems(initialItems); }, [initialItems]);
     |                     ^^^^^^^^ Avoid calling setState() directly within an effect
  68 |   useEffect(() => { setUnread(initialUnread); }, [initialUnread]);
  69 |
  70 |   useEffect(() => {  react-hooks/set-state-in-effect
  68:21  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/dashboard/NotificationBell.tsx:68:21
  66 |   // local state would keep serving a stale snapshot for the rest of the session.
  67 |   useEffect(() => { setItems(initialItems); }, [initialItems]);
> 68 |   useEffect(() => { setUnread(initialUnread); }, [initialUnread]);
     |                     ^^^^^^^^^ Avoid calling setState() directly within an effect
  69 |
  70 |   useEffect(() => {
  71 |     if (open) {                                                                 react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/dashboard/ProfileMenu.tsx
  36:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/dashboard/ProfileMenu.tsx:36:5
  34 |   useEffect(() => {
  35 |     const attr = document.documentElement.getAttribute('data-theme');
> 36 |     setTheme(attr === 'dark' ? 'dark' : 'light');
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  37 |   }, []);
  38 |
  39 |   // Move focus into the panel on open and back to the trigger on close — the  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/dashboard/TextAlertsBanner.tsx
  20:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/dashboard/TextAlertsBanner.tsx:20:7
  18 |     try {
  19 |       const at = Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0);
> 20 |       setHidden(Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS);
     |       ^^^^^^^^^ Avoid calling setState() directly within an effect
  21 |     } catch {
  22 |       setHidden(false);
  23 |     }  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/guest/LanguagePicker.tsx
  22:6  warning  React Hook useEffect has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useEffect call and refer to those specific props inside useEffect  react-hooks/exhaustive-deps

/home/user/workspace/moche-app/components/landing/Reveal.tsx
  64:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/components/landing/Reveal.tsx:64:7
  62 |     // some test runners): show immediately rather than hiding content.
  63 |     if (typeof IntersectionObserver === 'undefined') {
> 64 |       setShown(true);
     |       ^^^^^^^^ Avoid calling setState() directly within an effect
  65 |       return;
  66 |     }
  67 |  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/components/reports/ReportGrid.tsx
  178:17  warning  Compilation Skipped: Use of incompatible library

This API returns functions which cannot be memoized without leading to stale UI. To prevent this, by default React Compiler will skip memoizing this component/hook. However, you may see issues if values from this API are passed to other components/hooks that are memoized.

/home/user/workspace/moche-app/components/reports/ReportGrid.tsx:178:17
  176 |   }, []);
  177 |
> 178 |   const table = useReactTable({
      |                 ^^^^^^^^^^^^^ TanStack Table's `useReactTable()` API returns functions that cannot be memoized safely
  179 |     data: rows,
  180 |     columns,
  181 |     state: { sorting, columnFilters, columnOrder, columnVisibility },  react-hooks/incompatible-library

/home/user/workspace/moche-app/eslint.config.mjs
  10:1  warning  Assign array to a variable before exporting as module default  import/no-anonymous-default-export

/home/user/workspace/moche-app/lib/dashboard/use-dashboard-ui-state.ts
  47:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/lib/dashboard/use-dashboard-ui-state.ts:47:5
  45 |   // render expanded for one frame, then settle into the stored state.
  46 |   useEffect(() => {
> 47 |     setCollapsed(new Set(readArray(COLLAPSED_KEY)));
     |     ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  48 |   }, []);
  49 |
  50 |   const toggle = useCallback((id: string) => {  react-hooks/set-state-in-effect
  67:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/lib/dashboard/use-dashboard-ui-state.ts:67:5
  65 |   const [dismissed, setDismissed] = useState<string[]>([]);
  66 |   useEffect(() => {
> 67 |     setDismissed(readArray(DISMISSED_FEED_KEY));
     |     ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  68 |   }, []);
  69 |
  70 |   const dismiss = useCallback((id: string) => {                react-hooks/set-state-in-effect

/home/user/workspace/moche-app/lib/dashboard/use-zone-order.ts
  48:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/lib/dashboard/use-zone-order.ts:48:5
  46 |       ...defaults.filter((id) => !stored.includes(id)),
  47 |     ];
> 48 |     setOrder(merged.length > 0 ? merged : defaults);
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  49 |     // eslint-disable-next-line react-hooks/exhaustive-deps
  50 |   }, [defaultsKey]);
  51 |  react-hooks/set-state-in-effect
  49:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')
  70:5  warning  Unused eslint-disable directive (no problems were reported from 'react-hooks/exhaustive-deps')

/home/user/workspace/moche-app/lib/evals/golden.test.ts
  175:5  warning  Unused eslint-disable directive (no problems were reported from 'no-console')

/home/user/workspace/moche-app/postcss.config.mjs
  1:1  warning  Assign object to a variable before exporting as module default  import/no-anonymous-default-export

✖ 74 problems (0 errors, 74 warnings)
  0 errors and 5 warnings potentially fixable with the `--fix` option.
```

## Typecheck

```text
> moche-app@0.1.0 typecheck
> tsc --noEmit
```

## Registry and golden drift

```text
[registry-check] ok — field_registry.json matches generator: 56 fields, 49 scored, 14 domains
[drift] ok — supabase-migrations-GATE2-REGISTRY-SEED.sql matches field_registry.json
Golden eval suite is in sync.
```

## PostgreSQL authorization contracts

```text
NOTICE:  database "gate2" does not exist, skipping
== stubbing the pieces the hosted schema already provides ==
psql:/home/user/workspace/moche-app/scripts/gate2-local-stubs.sql:102: NOTICE:  policy "brain_select" for relation "public.brain_items" does not exist, skipping
psql:/home/user/workspace/moche-app/scripts/gate2-local-stubs.sql:105: NOTICE:  policy "brain_write" for relation "public.brain_items" does not exist, skipping
== applying supabase-migrations-GATE2-REGISTRY.sql ==
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:146: NOTICE:  constraint "field_registry_audience_matrix_chk" of relation "field_registry" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:277: NOTICE:  trigger "brain_values_enforce_registry_trg" for relation "public.brain_values" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:292: NOTICE:  policy "field_registry_select_authenticated" for relation "public.field_registry" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:302: NOTICE:  policy "brain_values_select_members" for relation "public.brain_values" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:307: NOTICE:  policy "brain_values_insert_editors" for relation "public.brain_values" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:313: NOTICE:  policy "brain_values_update_editors" for relation "public.brain_values" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:319: NOTICE:  policy "brain_values_delete_editors" for relation "public.brain_values" does not exist, skipping
== applying supabase-migrations-GATE2-REGISTRY-SEED.sql ==
== applying supabase-migrations-BRAIN-SECTIONS.sql ==
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-BRAIN-SECTIONS.sql:41: NOTICE:  constraint "brain_items_section_check" of relation "brain_items" does not exist, skipping
== idempotency: re-applying all three ==
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:110: NOTICE:  relation "field_registry" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:208: NOTICE:  relation "brain_values" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:218: NOTICE:  relation "brain_values_one_active_per_field" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:221: NOTICE:  relation "brain_values_property_idx" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-GATE2-REGISTRY.sql:223: NOTICE:  relation "brain_values_ttl_idx" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-BRAIN-SECTIONS.sql:33: NOTICE:  column "section" of relation "brain_items" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/supabase-migrations-BRAIN-SECTIONS.sql:60: NOTICE:  relation "brain_items_property_section_idx" already exists, skipping
== reviewed Wi-Fi instruction delta, including idempotency ==
== contract tests ==
Timing is off.
SET
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
INSERT 0 2
INSERT 0 2
GRANT
GRANT
GRANT
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:86: NOTICE:  PASS  A1 registry materialized with every declared field  (= 56)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:90: NOTICE:  PASS  A2 exactly six hard-block fields (Section 5.3)  (= 6)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:95: NOTICE:  PASS  A3 no system-section field carries scoring weight  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:99: NOTICE:  PASS  A4 every secret-typed field routes to Vault (Section 3.2)  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:107: NOTICE:  PASS  A5 every on_failure_field resolves to a declared field  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:113: NOTICE:  PASS  A6 every registry default_audience satisfies the compatibility matrix  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:122: NOTICE:  PASS  A7 registry rejects a secret tier addressed to a public guest surface  (rejected: new row for relation "field_registry" violates check constraint "field_registry_audience_m)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:132: NOTICE:  PASS  A8 registry rejects a scored system-section field  (rejected: new row for relation "field_registry" violates check constraint "field_registry_system_uns)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:139: NOTICE:  PASS  A9 both Wi-Fi guidance fields are declared guest-safe text  (= 2)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:146: NOTICE:  PASS  A10 legacy Wi-Fi password stays secret but is not collected or scored  (= 1)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:157: NOTICE:  PASS  B1 positive control: a well-formed public fact is accepted
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:164: NOTICE:  PASS  B2 positive control: a host-only Vault-pointer secret is accepted
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:171: NOTICE:  PASS  B3 a stay-scoped secret cannot be stored as plaintext jsonb (Section 6)  (rejected: field wifi_password is secret-typed and requires secret_ref_or_ciphertext)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:178: NOTICE:  PASS  B4 a row cannot carry both a value and a secret pointer  (rejected: new row for relation "brain_values" violates check constraint "brain_values_payload_exclus)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:185: NOTICE:  PASS  B5 a row cannot be empty of both payload columns  (rejected: new row for relation "brain_values" violates check constraint "brain_values_payload_exclus)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:193: NOTICE:  PASS  B6 a door/Wi-Fi secret cannot be addressed to a pre-arrival surface  (rejected: field wifi_password may not be addressed to guest_prearrival (registry default is guest_in)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:200: NOTICE:  PASS  B7 a host_only fact cannot be addressed to any guest surface  (rejected: field utility_shutoff_locations may not be addressed to guest_instay (registry default is )
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:208: NOTICE:  PASS  B8a positive control: quiet_hours accepted at its registry tier
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:213: NOTICE:  PASS  B8b a caller cannot relabel a field's tier away from the registry  (rejected: field quiet_hours is tier public_guest, cannot be written as host_only)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:221: NOTICE:  PASS  B9 positive control: a fact may be addressed more narrowly than the default
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:228: NOTICE:  PASS  B10 a fact cannot be addressed wider than its registry default  (rejected: field area_safety_notes may not be addressed to guest_public (registry default is guest_pr)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:235: NOTICE:  PASS  B11 an undeclared field_id is rejected  (rejected: field_id not_a_real_field is not declared in field_registry)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:242: NOTICE:  PASS  B12 a second active value for the same field is rejected  (rejected: duplicate key value violates unique constraint "brain_values_one_active_per_field")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:248: NOTICE:  PASS  B13 ttl_expires_at is populated from registry ttl_days  (= t)
 expect_eq 
-----------
 
(1 row)

INSERT 0 1
SET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:269: NOTICE:  PASS  C0 POSITIVE CONTROL: an editor does see their own property's facts  (= 4)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:274: NOTICE:  PASS  C1 a member of property A sees zero rows from property B  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:278: NOTICE:  PASS  C2 an unqualified SELECT returns only in-tenant rows  (= 4)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:285: NOTICE:  PASS  C3 cannot INSERT a fact into a foreign property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:293: NOTICE:  PASS  C4 cannot move an owned fact into a foreign property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:298: NOTICE:  PASS  C5 cannot UPDATE a foreign property's fact  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:303: NOTICE:  PASS  C6 cannot DELETE a foreign property's fact  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:310: NOTICE:  PASS  C7 a user with no membership anywhere sees nothing  (= 0)
 expect_eq 
-----------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:316: NOTICE:  PASS  C8 POSITIVE CONTROL: a viewer reads their own property's facts  (= 4)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:323: NOTICE:  PASS  C9 a viewer cannot write to their own property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:328: NOTICE:  PASS  C10 a viewer cannot update their own property  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:334: NOTICE:  PASS  C11 an unauthenticated session sees nothing  (= 0)
 expect_eq 
-----------
 
(1 row)

RESET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:342: NOTICE:  PASS  C12 authenticated cannot mutate the registry  (rejected: permission denied for table field_registry)
 expect_fail 
-------------
 
(1 row)

RESET
INSERT 0 2
SET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:360: NOTICE:  PASS  D1 positive control: editor sees only their own Wi-Fi location  (= 1)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:364: NOTICE:  PASS  D2 foreign property Wi-Fi location is not visible  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:370: NOTICE:  PASS  D3 editor cannot write connection instructions on a foreign property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:374: NOTICE:  PASS  D4 unassigned user cannot read Wi-Fi guidance  (= 0)
 expect_eq 
-----------
 
(1 row)

RESET
RESET
INSERT 0 3
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:403: NOTICE:  PASS  E1 brain_items.section is nullable so legacy rows need no backfill  (= YES)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:411: NOTICE:  PASS  E2 an invented section is rejected by the CHECK constraint  (rejected: new row for relation "brain_items" violates check constraint "brain_items_section_check")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:416: NOTICE:  PASS  E3 a system domain is not a valid host-facing section  (rejected: new row for relation "brain_items" violates check constraint "brain_items_section_check")
 expect_fail 
-------------
 
(1 row)

SET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:424: NOTICE:  PASS  E4 POSITIVE CONTROL: an editor sees exactly their own property's Brain rows  (= 2)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:429: NOTICE:  PASS  E5 POSITIVE CONTROL: an editor can file a row into a section
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:434: NOTICE:  PASS  E6 POSITIVE CONTROL: an editor can re-section their own row  (1 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:441: NOTICE:  PASS  E7 a foreign property's Brain rows are invisible  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:446: NOTICE:  PASS  E8 cannot re-section a foreign property's Brain row  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:451: NOTICE:  PASS  E9 cannot DELETE a foreign property's Brain row  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:458: NOTICE:  PASS  E10 cannot move an owned Brain row into a foreign property  (rejected: new row violates row-level security policy for table "brain_items")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:463: NOTICE:  PASS  E11 cannot insert a Brain row into a foreign property  (rejected: new row violates row-level security policy for table "brain_items")
 expect_fail 
-------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:470: NOTICE:  PASS  E12 a user with no membership anywhere sees no Brain rows  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:475: NOTICE:  PASS  E13 an unassigned user cannot file a Brain row  (rejected: new row violates row-level security policy for table "brain_items")
 expect_fail 
-------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:481: NOTICE:  PASS  E14 POSITIVE CONTROL: a viewer reads their own property's Brain rows  (= 3)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:486: NOTICE:  PASS  E15 a viewer cannot re-section their own property's rows  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:491: NOTICE:  PASS  E16 an unauthenticated session sees no Brain rows  (= 0)
 expect_eq 
-----------
 
(1 row)

RESET
== all contract tests passed ==
== door-code host-only contract tests ==
Timing is off.
SET
CREATE FUNCTION
CREATE FUNCTION
RESET
psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:45: NOTICE:  PASS  DC1 door code is a host-only Vault secret, optional and unscored  (= 1)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:52: NOTICE:  PASS  DC2 guest entry instructions are guest-safe text and the access hard block  (= 1)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:56: NOTICE:  PASS  DC3 still exactly six hard blocks  (= 6)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:61: NOTICE:  PASS  DC4 the door code is not a hard block  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:68: NOTICE:  PASS  DC5 a door code cannot be addressed to any guest surface  (rejected: field door_code_or_entry_method may not be addressed to guest_instay (registry default is )
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:87: NOTICE:  SKIP  DC6 (Vault envelope not applied in this database)
DO
psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:100: NOTICE:  SKIP  DC7 (brain_values_set_secret not present in this database)
DO
psql:/home/user/workspace/moche-app/scripts/gate2-door-code-contract-tests.sql:114: NOTICE:  SKIP  DC8 (20261001122531_door_code_host_only not applied in this database)
DO
== door-code contract tests passed ==
== messaging phone/consent migration and real RLS contract tests ==
psql:/home/user/workspace/moche-app/supabase/migrations/20260908134135_guest_messaging_phone_consent.sql:49: NOTICE:  trigger "trg_protect_profile_phone_verification" for relation "public.profiles" does not exist, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/20260908134135_guest_messaging_phone_consent.sql:6: NOTICE:  column "terms_accepted_at" of relation "guest_access_sessions" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/20260908134135_guest_messaging_phone_consent.sql:6: NOTICE:  column "phone_verified_at" of relation "guest_access_sessions" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/20260908134135_guest_messaging_phone_consent.sql:6: NOTICE:  column "sms_opted_out_at" of relation "guest_access_sessions" already exists, skipping
psql:/home/user/workspace/moche-app/supabase/migrations/20260908134135_guest_messaging_phone_consent.sql:18: NOTICE:  relation "sms_suppressions" already exists, skipping
BEGIN
INSERT 0 2
INSERT 0 2
INSERT 0 2
INSERT 0 2
psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:31: NOTICE:  PASS: RLS enabled, no false backfill, existing tenant policies unchanged
DO
SET
INSERT 0 1
UPDATE 1
UPDATE 1
UPDATE 1
psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:45: NOTICE:  PASS: service role can record and read suppression and session proof
DO
RESET
SET
psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:78: NOTICE:  PASS: anonymous suppression read/write denied, session read/write denied
DO
RESET
SET
              set_config              
--------------------------------------
 a2000000-0000-4000-8000-000000000001
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:129: NOTICE:  PASS: assigned host reads own session only; suppression and session writes denied
psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:129: NOTICE:  PASS: host profile positive controls; forged proof, swapped phone and cross-account writes denied
DO
              set_config              
--------------------------------------
 a2000000-0000-4000-8000-000000000002
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:136: NOTICE:  PASS: other account cannot read first account session
DO
              set_config              
--------------------------------------
 a2000000-0000-4000-8000-000000000003
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:144: NOTICE:  PASS: unassigned member cannot read any session
DO
RESET
SET
DELETE 1
psql:/home/user/workspace/moche-app/scripts/messaging-contract-tests.sql:151: NOTICE:  PASS: service suppression deletion positive control
DO
RESET
ROLLBACK
MESSAGING SQL CONTRACT VERIFIED
BEGIN
INSERT 0 2
INSERT 0 3
INSERT 0 5
INSERT 0 2
SET
INSERT 0 6
DO
RESET
SET
              set_config              
--------------------------------------
 b2000000-0000-4000-8000-000000000002
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-notification-contract-tests.sql:53: NOTICE:  PASS: assigned property read/read_at update positive; cross-property, cross-account and scope/content forgery denied
DO
              set_config              
--------------------------------------
 b2000000-0000-4000-8000-000000000003
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-notification-contract-tests.sql:59: NOTICE:  PASS: member B sees own property and broadcast, never another targeted recipient
DO
              set_config              
--------------------------------------
 b2000000-0000-4000-8000-000000000004
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-notification-contract-tests.sql:66: NOTICE:  PASS: unassigned member sees only account broadcast
DO
              set_config              
--------------------------------------
 b2000000-0000-4000-8000-000000000001
(1 row)

psql:/home/user/workspace/moche-app/scripts/messaging-notification-contract-tests.sql:71: NOTICE:  PASS: owner sees property broadcasts but not messages targeted to another member
DO
              set_config              
--------------------------------------
 b2000000-0000-4000-8000-000000000005
(1 row)

DO
RESET
SET
psql:/home/user/workspace/moche-app/scripts/messaging-notification-contract-tests.sql:94: NOTICE:  PASS: anonymous notification read/write/truncate denied
DO
RESET
SET
psql:/home/user/workspace/moche-app/scripts/messaging-notification-contract-tests.sql:109: NOTICE:  PASS: authenticated notification insert/delete/truncate denied
DO
RESET
ROLLBACK
MESSAGING NOTIFICATION RLS VERIFIED
== GATE 2 SQL VERIFIED ==
```

## Actual release rollback and idempotency

```text
Offline SQL evidence: /tmp/property-brain-release-sql.1wAO0c
PASS: final assertion failure rolls back both actual migrations
PASS: actual release succeeds with its final assertions
PASS: actual release is idempotent
PASS: real messaging authorization and proof contracts
PROPERTY BRAIN RELEASE SQL VERIFIED
```

## Local Recs browser tests

```text
Running 5 tests using 1 worker

  ✓  1 test/local-recs-ui/local-recs.spec.ts:8:5 › failed save retains every draft field, especially guest visibility (1.2s)
  ✓  2 test/local-recs-ui/local-recs.spec.ts:22:5 › map click populates a manual point, while clear and cancel preserve details (738ms)
  ✓  3 test/local-recs-ui/local-recs.spec.ts:36:5 › keyboard selects a hidden pin and saving updates its card and popup note (894ms)
  ✓  4 test/local-recs-ui/local-recs.spec.ts:46:5 › temporary search selection never prefills the manual form (1.7s)
  ✓  5 test/local-recs-ui/local-recs.spec.ts:63:5 › a map failure leaves manual entry usable (1.2s)

  5 passed (9.6s)
```

## Messaging browser tests

```text
Running 6 tests using 1 worker

  ✓  1 [desktop] › test/messaging-ui/portal-theme.spec.ts:3:5 › portal controls remain readable in dark and light theme (1.3s)
  -  2 [desktop] › test/messaging-ui/portal-theme.spec.ts:20:5 › card dialog is visible and internally scrollable without page scrolling
  ✓  3 [desktop] › test/messaging-ui/recovery.spec.ts:3:5 › own consent + phone OTP, explicit recovery, exact focus, and workflow warning (2.4s)
  ✓  4 [mobile] › test/messaging-ui/portal-theme.spec.ts:3:5 › portal controls remain readable in dark and light theme (585ms)
  ✓  5 [mobile] › test/messaging-ui/portal-theme.spec.ts:20:5 › card dialog is visible and internally scrollable without page scrolling (743ms)
  ✓  6 [mobile] › test/messaging-ui/recovery.spec.ts:3:5 › own consent + phone OTP, explicit recovery, exact focus, and workflow warning (1.2s)

  1 skipped
  5 passed (12.4s)
::notice title=🎭 Playwright Run Summary::  1 skipped%0A  5 passed (12.4s)
```

## AI workflow browser tests

```text
Running 40 tests using 2 workers

  ✓   1 [desktop] › test/ai-workflows-ui/escalation.spec.ts:4:7 › escalation manual category override reaches the action unchanged (1.2s)
  ✓   2 [desktop] › test/ai-workflows-ui/escalation.spec.ts:4:7 › escalation default Auto reaches the action unchanged (1.2s)
  ✓   4 [desktop] › test/ai-workflows-ui/escalation.spec.ts:43:5 › reply-only permission hides the learning controls and never submits a learning choice (593ms)
  ✓   3 [desktop] › test/ai-workflows-ui/escalation.spec.ts:24:5 › one-off escalation reply excludes learning fields and reports independent warning (795ms)
  ✓   5 [desktop] › test/ai-workflows-ui/guest-needs.spec.ts:3:5 › Guest Needs renders a real interview choice then its final summary without another question (954ms)
  ✓   6 [desktop] › test/ai-workflows-ui/guest-needs.spec.ts:26:5 › Guest Needs safety escalation displays the returned urgent guidance and ends the interview (858ms)
  ✓   7 [desktop] › test/ai-workflows-ui/knowledge.spec.ts:6:5 › AI improvement remains an editable draft until the host explicitly saves (1.0s)
  ✓   8 [desktop] › test/ai-workflows-ui/knowledge.spec.ts:39:5 › failed AI improvement and failed manual save retain the full host draft (1.0s)
  ✓  10 [desktop] › test/ai-workflows-ui/knowledge.spec.ts:92:5 › truncated pasted notes show the review warning without discarding any original input (1.1s)
  ✓   9 [desktop] › test/ai-workflows-ui/knowledge.spec.ts:60:5 › saved-but-unindexed feedback retains the AI draft and retries the same item (1.3s)
  ✓  12 [desktop] › test/ai-workflows-ui/knowledge.spec.ts:144:5 › file import posts the selected file only to the mock endpoint and displays review feedback (858ms)
  ✓  11 [desktop] › test/ai-workflows-ui/knowledge.spec.ts:120:5 › URL import failure keeps inputs; success says review queue rather than published (957ms)
  ✓  13 [desktop] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › start safety guidance survives HTTP 500 without a saved or notified claim (739ms)
  ✓  14 [desktop] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › start safety guidance survives HTTP 409 without a saved or notified claim (663ms)
  ✓  16 [desktop] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › followup safety guidance survives HTTP 409 without a saved or notified claim (869ms)
  ✓  15 [desktop] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › followup safety guidance survives HTTP 500 without a saved or notified claim (930ms)
  ✓  18 [desktop] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:64:5 › missing safety guidance keeps the existing completion fallback without rendering undefined (690ms)
  ✓  17 [desktop] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:36:5 › initial safety guidance is escaped text and does not leak into a subsequent nonurgent report (917ms)
  ✓  20 [desktop] › test/ai-workflows-ui/setup-import.spec.ts:28:5 › failed setup import keeps its actionable error visible after cleanup (499ms)
  ✓  19 [desktop] › test/ai-workflows-ui/setup-import.spec.ts:3:5 › setup import warning survives URL cleanup and refresh does not repeat the import (778ms)
  ✓  21 [mobile] › test/ai-workflows-ui/escalation.spec.ts:4:7 › escalation default Auto reaches the action unchanged (1.1s)
  ✓  22 [mobile] › test/ai-workflows-ui/escalation.spec.ts:4:7 › escalation manual category override reaches the action unchanged (983ms)
  ✓  24 [mobile] › test/ai-workflows-ui/escalation.spec.ts:43:5 › reply-only permission hides the learning controls and never submits a learning choice (671ms)
  ✓  23 [mobile] › test/ai-workflows-ui/escalation.spec.ts:24:5 › one-off escalation reply excludes learning fields and reports independent warning (874ms)
  ✓  25 [mobile] › test/ai-workflows-ui/guest-needs.spec.ts:3:5 › Guest Needs renders a real interview choice then its final summary without another question (943ms)
  ✓  26 [mobile] › test/ai-workflows-ui/guest-needs.spec.ts:26:5 › Guest Needs safety escalation displays the returned urgent guidance and ends the interview (862ms)
  ✓  27 [mobile] › test/ai-workflows-ui/knowledge.spec.ts:6:5 › AI improvement remains an editable draft until the host explicitly saves (1.2s)
  ✓  28 [mobile] › test/ai-workflows-ui/knowledge.spec.ts:39:5 › failed AI improvement and failed manual save retain the full host draft (1.1s)
  ✓  30 [mobile] › test/ai-workflows-ui/knowledge.spec.ts:92:5 › truncated pasted notes show the review warning without discarding any original input (1.1s)
  ✓  29 [mobile] › test/ai-workflows-ui/knowledge.spec.ts:60:5 › saved-but-unindexed feedback retains the AI draft and retries the same item (1.6s)
  ✓  31 [mobile] › test/ai-workflows-ui/knowledge.spec.ts:120:5 › URL import failure keeps inputs; success says review queue rather than published (1.8s)
  ✓  32 [mobile] › test/ai-workflows-ui/knowledge.spec.ts:144:5 › file import posts the selected file only to the mock endpoint and displays review feedback (1.6s)
  ✓  33 [mobile] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › start safety guidance survives HTTP 500 without a saved or notified claim (2.1s)
  ✓  34 [mobile] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › start safety guidance survives HTTP 409 without a saved or notified claim (2.2s)
  ✓  35 [mobile] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › followup safety guidance survives HTTP 500 without a saved or notified claim (1.7s)
  ✓  36 [mobile] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:5:9 › followup safety guidance survives HTTP 409 without a saved or notified claim (2.1s)
  ✓  37 [mobile] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:36:5 › initial safety guidance is escaped text and does not leak into a subsequent nonurgent report (1.9s)
  ✓  38 [mobile] › test/ai-workflows-ui/maintenance-safety-completion.spec.ts:64:5 › missing safety guidance keeps the existing completion fallback without rendering undefined (1.4s)
  ✓  40 [mobile] › test/ai-workflows-ui/setup-import.spec.ts:28:5 › failed setup import keeps its actionable error visible after cleanup (1.0s)
  ✓  39 [mobile] › test/ai-workflows-ui/setup-import.spec.ts:3:5 › setup import warning survives URL cleanup and refresh does not repeat the import (1.6s)

  40 passed (27.6s)
```

## Production build using placeholder public configuration

```text
> moche-app@0.1.0 build
> next build

▲ Next.js 16.3.0 (Turbopack)
✓ Running next.config.mjs took 472ms
- Experiments (use with caution):
  · clientTraceMetadata

⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.

  To migrate automatically, run:
  npx @next/codemod@canary middleware-to-proxy .

  Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
  Creating an optimized production build ...
✓ Compiled successfully in 74s
  Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 602ms
  Running TypeScript ...
✓ Finished writing to filesystem cache in 11.1s
  Finished TypeScript in 42s ...
  Collecting page data using 1 worker ...
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715
✓ Finished filesystem cache database compaction in 49s
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715
  Generating static pages using 1 worker (0/35) ...
  Generating static pages using 1 worker (8/35) 
  Generating static pages using 1 worker (17/35) 
  Generating static pages using 1 worker (26/35) 
✓ Generating static pages using 1 worker (35/35) in 1810ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ○ /about
├ ƒ /answer/[token]
├ ƒ /api/cron/freshness-digest
├ ƒ /api/cron/ical-sync
├ ƒ /api/cron/learn-digest
├ ƒ /api/cron/notification-escalations
├ ƒ /api/csp-report
├ ƒ /api/geo/autocomplete
├ ƒ /api/guest/[slug]/appliances
├ ƒ /api/guest/[slug]/appliances/[applianceId]/questions
├ ƒ /api/guest/[slug]/assistant-cards
├ ƒ /api/guest/[slug]/auth/code
├ ƒ /api/guest/[slug]/auth/code/confirm
├ ƒ /api/guest/[slug]/auth/guest-code
├ ƒ /api/guest/[slug]/auth/redeem
├ ƒ /api/guest/[slug]/auth/refresh
├ ƒ /api/guest/[slug]/chat
├ ƒ /api/guest/[slug]/escalate
├ ƒ /api/guest/[slug]/extras-orders
├ ƒ /api/guest/[slug]/extras-orders/[orderId]
├ ƒ /api/guest/[slug]/extras-request
├ ƒ /api/guest/[slug]/feedback
├ ƒ /api/guest/[slug]/host-chat
├ ƒ /api/guest/[slug]/host-chat/recover
├ ƒ /api/guest/[slug]/host-chat/sync-escalation
├ ƒ /api/guest/[slug]/messages
├ ƒ /api/guest/[slug]/notify-consent
├ ƒ /api/guest/[slug]/notify-email
├ ƒ /api/guest/[slug]/party-invite
├ ƒ /api/guest/[slug]/places/[id]
├ ƒ /api/guest/[slug]/push-subscription
├ ƒ /api/guest/[slug]/register
├ ƒ /api/guest/[slug]/service-request/[id]/message
├ ƒ /api/guest/[slug]/service-request/[id]/upload
├ ƒ /api/guest/[slug]/service-request/start
├ ƒ /api/guest/[slug]/service-requests
├ ƒ /api/guest/[slug]/stay-guest/register
├ ƒ /api/guest/[slug]/verify/confirm
├ ƒ /api/guest/[slug]/verify/start
├ ƒ /api/guest/email/confirm
├ ƒ /api/guest/email/unsubscribe
├ ƒ /api/guest/review-nudge
├ ƒ /api/host/properties/[id]/brain/door-code
├ ƒ /api/host/properties/[id]/extras-orders/[orderId]/status
├ ƒ /api/host/properties/[id]/guest-chats
├ ƒ /api/host/properties/[id]/guest-chats/[conversationId]/messages
├ ƒ /api/host/properties/[id]/guest-chats/announcements
├ ƒ /api/host/properties/[id]/guest-chats/permissions
├ ƒ /api/host/properties/[id]/links
├ ƒ /api/host/properties/[id]/links/[linkId]/regenerate-code
├ ƒ /api/host/properties/[id]/links/[linkId]/revoke-code
├ ƒ /api/host/properties/[id]/local/search
├ ƒ /api/host/properties/[id]/party-invite-settings
├ ƒ /api/host/properties/[id]/preview-chat
├ ƒ /api/host/properties/[id]/preview-extras-request
├ ƒ /api/host/properties/[id]/preview-host-chat
├ ƒ /api/host/properties/[id]/preview-service-request
├ ƒ /api/host/properties/[id]/service-requests/[ticketId]/assign
├ ƒ /api/host/properties/[id]/service-requests/[ticketId]/media
├ ƒ /api/host/properties/[id]/service-requests/[ticketId]/report
├ ƒ /api/host/properties/[id]/service-requests/[ticketId]/share
├ ƒ /api/host/properties/[id]/service-requests/[ticketId]/status
├ ƒ /api/host/properties/[id]/sessions
├ ƒ /api/host/properties/[id]/sessions/[sessionId]/revoke
├ ƒ /api/host/properties/[id]/stays
├ ƒ /api/host/properties/[id]/stays/[stayId]/guests
├ ƒ /api/host/properties/[id]/stays/[stayId]/party-invite
├ ƒ /api/host/properties/[id]/stays/[stayId]/share
├ ƒ /api/internal/ai-embedding-health
├ ƒ /api/internal/integrations/readiness
├ ƒ /api/legal/accept
├ ƒ /api/legal/delete
├ ƒ /api/legal/export
├ ƒ /api/notifications/[id]/open
├ ƒ /api/properties/[id]/appliance-catalog
├ ƒ /api/properties/[id]/cover
├ ƒ /api/properties/[id]/ingest/document
├ ƒ /api/properties/[id]/ingest/text
├ ƒ /api/properties/[id]/ingest/url
├ ƒ /api/properties/[id]/storage/presign
├ ƒ /api/properties/[id]/updates/[updateId]
├ ƒ /api/property-imports
├ ƒ /api/property-imports/[jobId]
├ ƒ /api/property-imports/[jobId]/gaps
├ ƒ /api/property-imports/[jobId]/review
├ ƒ /api/stripe/checkout
├ ƒ /api/stripe/portal
├ ƒ /api/stripe/refund
├ ƒ /api/stripe/webhook
├ ƒ /api/waitlist
├ ƒ /api/webhooks/twilio
├ ƒ /api/webhooks/twilio/status
├ ○ /apple-icon.png
├ ƒ /auth/callback
├ ƒ /dashboard
├ ƒ /dashboard/billing
├ ƒ /dashboard/escalations
├ ƒ /dashboard/escalations/[id]
├ ƒ /dashboard/extras
├ ƒ /dashboard/notifications
├ ƒ /dashboard/profile
├ ƒ /dashboard/profile/access
├ ƒ /dashboard/profile/billing
├ ƒ /dashboard/profile/details
├ ƒ /dashboard/profile/documents
├ ƒ /dashboard/profile/legal
├ ƒ /dashboard/profile/notifications
├ ƒ /dashboard/profile/privacy
├ ƒ /dashboard/profile/security
├ ƒ /dashboard/profile/support
├ ƒ /dashboard/profile/usage
├ ƒ /dashboard/profile/user-management
├ ƒ /dashboard/properties
├ ƒ /dashboard/properties/[id]
├ ƒ /dashboard/properties/[id]/appliances
├ ƒ /dashboard/properties/[id]/brain
├ ƒ /dashboard/properties/[id]/brain/add
├ ƒ /dashboard/properties/[id]/brain/go-live
├ ƒ /dashboard/properties/[id]/brain/spaces
├ ƒ /dashboard/properties/[id]/escalations
├ ƒ /dashboard/properties/[id]/extras
├ ƒ /dashboard/properties/[id]/guest-chat
├ ƒ /dashboard/properties/[id]/inbox
├ ƒ /dashboard/properties/[id]/local
├ ƒ /dashboard/properties/[id]/nearby
├ ƒ /dashboard/properties/[id]/recommendations
├ ƒ /dashboard/properties/[id]/settings
├ ƒ /dashboard/properties/[id]/stays
├ ƒ /dashboard/properties/[id]/stays/[stayId]/conversations/[conversationId]
├ ƒ /dashboard/properties/[id]/welcome-card
├ ƒ /dashboard/properties/new
├ ƒ /dashboard/properties/new/review/[jobId]
├ ƒ /dashboard/reports
├ ƒ /dashboard/reports/ai-usage
├ ƒ /dashboard/reports/archived-properties
├ ƒ /dashboard/reports/conversations
├ ƒ /dashboard/reports/escalations
├ ƒ /dashboard/reports/extras
├ ƒ /dashboard/reports/guests
├ ƒ /dashboard/reports/service-request/[id]
├ ƒ /dashboard/reports/service-requests
├ ƒ /dashboard/reports/stays
├ ƒ /dashboard/service-requests
├ ƒ /dashboard/service-requests/[id]
├ ƒ /dashboard/updates
├ ○ /founding-terms
├ ƒ /g/[slug]
├ ƒ /g/[slug]/join
├ ƒ /g/[slug]/local
├ ○ /guest-experience
├ ƒ /home
├ ○ /how-it-works
├ ○ /icon.svg
├ ƒ /invite/[token]
├ ○ /legal
├ ○ /legal/acceptable-use
├ ○ /legal/ai-policy
├ ○ /legal/cookies
├ ○ /legal/dpa
├ ○ /legal/msa
├ ○ /legal/open-source
├ ○ /legal/privacy
├ ○ /legal/refund
├ ○ /legal/security
├ ○ /legal/subprocessors
├ ○ /legal/support
├ ○ /legal/terms
├ ○ /login
├ ƒ /login/verify
├ ○ /opengraph-image.png
├ ○ /reset
├ ○ /reset/update
├ ○ /resources/guest-communication-guide
├ ○ /robots.txt
├ ○ /security
├ ○ /signup
├ ○ /sitemap.xml
├ ƒ /stay/[slug]
├ ○ /support
├ ○ /verify-email
└ ƒ /welcome


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
