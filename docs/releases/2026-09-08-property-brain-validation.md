# Property Brain release validation

Local validation uses synthetic data, mocked providers, and isolated PostgreSQL. No live message sends are included.

## Unit tests

```text
> moche-app@0.1.0 test
> vitest run


 RUN  v3.2.7 /home/user/workspace/moche-app

 ✓ lib/storage/cover-resize.test.ts (7 tests) 1695ms
   ✓ buildCoverDerivatives > produces one JPEG per configured size at exact dimensions  302ms
   ✓ buildCoverDerivatives > upscales a source smaller than the target rather than failing  343ms
   ✓ buildCoverDerivatives > accepts webp and jpeg sources, not just png  507ms
stderr | lib/router/modelRouter.test.ts > routedCompletion > refuses the external guest route when the allowlist is empty
{"level":"warn","msg":"openrouter_provider_ineligible","meta":{"task":"concierge","code":"provider_ineligible","reason":"routine-guest model allowlist is empty; external routing is ineligible"},"ts":"2026-09-08T14:31:00.706Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > extraction issues no request or weak fallback when no provider is reviewed
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"extraction","code":"provider_ineligible"},"ts":"2026-09-08T14:31:00.723Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > brain_ops issues no request or weak fallback when no provider is reviewed
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"brain_ops","code":"provider_ineligible"},"ts":"2026-09-08T14:31:00.743Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > concierge_complex issues no request or weak fallback when no provider is reviewed
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"concierge_complex","code":"provider_ineligible"},"ts":"2026-09-08T14:31:00.756Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > extraction fails closed on a non-2xx response
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"extraction","code":"unavailable"},"ts":"2026-09-08T14:31:00.828Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > brain_ops fails closed on a non-2xx response
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"brain_ops","code":"unavailable"},"ts":"2026-09-08T14:31:00.846Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > concierge_complex fails closed on a non-2xx response
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"concierge_complex","code":"unavailable"},"ts":"2026-09-08T14:31:00.861Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > extraction fails closed on a network error
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"extraction","code":"unavailable"},"ts":"2026-09-08T14:31:00.890Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > brain_ops fails closed on a network error
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"brain_ops","code":"unavailable"},"ts":"2026-09-08T14:31:00.929Z"}

stderr | lib/router/modelRouter.test.ts > routedCompletion > concierge_complex fails closed on a network error
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"concierge_complex","code":"unavailable"},"ts":"2026-09-08T14:31:00.945Z"}

 ✓ lib/router/modelRouter.test.ts (43 tests) 551ms
 ✓ test/messaging-runtime-config.test.ts (3 tests) 211ms
stderr | lib/auth/guards.test.ts > requireFounder > returns the context unchanged when isFounder is true
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715

 ✓ lib/auth/guards.test.ts (7 tests) 369ms
   ✓ requireFounder > returns the context unchanged when isFounder is true  340ms
stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > brain_ops fails closed on provider failure
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"brain_ops","code":"unavailable"},"ts":"2026-09-08T14:31:03.332Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > extraction fails closed on provider failure
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"extraction","code":"unavailable"},"ts":"2026-09-08T14:31:03.427Z"}

stderr | lib/router/reliability.test.ts > high-reliability routing cannot silently downgrade > concierge_complex fails closed on provider failure
{"level":"warn","msg":"high_reliability_route_failed","meta":{"task":"concierge_complex","code":"unavailable"},"ts":"2026-09-08T14:31:03.513Z"}

 ✓ lib/router/reliability.test.ts (8 tests) 371ms
 ✓ lib/guest/concierge-local-visibility.test.ts (9 tests) 88ms
 ✓ lib/queue/pipeline.test.ts (56 tests) 354ms
 ✓ test/messaging-recovery.test.ts (43 tests) 424ms
 ✓ test/integration-send-safety.test.ts (6 tests) 104ms
 ✓ lib/local/distance.test.ts (14 tests) 152ms
 ✓ test/messaging-routes.test.ts (17 tests) 64ms
stdout | lib/evals/golden.test.ts > gate summary > reports pass rate per archetype
urban_studio_no_parking: 200/200 (100.0%)
offgrid_cabin_no_wifi: 200/200 (100.0%)
multistory_beach_house: 200/200 (100.0%)

 ✓ lib/evals/golden.test.ts (24 tests) 133ms
 ✓ test/messaging-notifications.test.ts (15 tests) 68ms
 ✓ lib/local/search.test.ts (26 tests) 22ms
 ✓ test/brain-save-wifi.test.ts (7 tests) 50ms
 ✓ lib/local/merge.test.ts (35 tests) 30ms
 ✓ lib/service-requests/share-report.test.ts (9 tests) 34ms
 ✓ lib/guest/concierge-routing.test.ts (19 tests) 23ms
 ✓ lib/brain/completeness.test.ts (25 tests) 12ms
stdout | lib/billing/quantity-sync.test.ts > syncBillableQuantity > updates Stripe with no proration when the count has changed
{"level":"info","msg":"quantity_sync_updated","meta":{"subscriptionId":"sub_1","from":1,"to":4},"ts":"2026-09-08T14:31:13.680Z"}

stderr | lib/billing/quantity-sync.test.ts > syncBillableQuantity > does not throw when the subscription has no items
{"level":"warn","msg":"quantity_sync_no_subscription_item","meta":{"subscriptionId":"sub_1"},"ts":"2026-09-08T14:31:13.690Z"}

stderr | lib/billing/quantity-sync.test.ts > syncBillableQuantity > swallows a subscription read error
{"level":"warn","msg":"quantity_sync_subscription_read_failed","meta":{"error":"db down"},"ts":"2026-09-08T14:31:13.691Z"}

stderr | lib/billing/quantity-sync.test.ts > syncBillableQuantity > swallows a Stripe failure so the property operation still succeeds
{"level":"warn","msg":"quantity_sync_failed","meta":{"error":"stripe 500"},"ts":"2026-09-08T14:31:13.692Z"}

 ✓ lib/billing/quantity-sync.test.ts (16 tests) 21ms
 ✓ lib/dashboard/plan-banner.test.ts (28 tests) 24ms
 ✓ test/brain-improve-wifi.test.ts (3 tests) 24ms
 ✓ lib/guest/wifi-instructions.test.ts (37 tests) 26ms
 ✓ lib/guest/history.test.ts (20 tests) 21ms
 ✓ lib/guest/extras.test.ts (42 tests) 19ms
 ✓ test/integration-readiness.test.ts (24 tests) 22ms
 ✓ test/messaging-phone-proof.test.ts (7 tests) 21ms
 ✓ test/local-recs-flows.test.ts (17 tests) 22ms
 ✓ lib/normalizer/wifi-safety.test.ts (5 tests) 10ms
 ✓ test/preview-endpoints.test.ts (10 tests) 20ms
 ✓ lib/brain/proposals.test.ts (41 tests) 13ms
 ✓ lib/design/palette.test.ts (57 tests) 10ms
 ✓ lib/brain/coverage.test.ts (13 tests) 14ms
 ✓ lib/brain/setup-autofill.test.ts (8 tests) 7ms
 ✓ lib/brain/legacy-migration.test.ts (15 tests) 16ms
 ✓ lib/brain/wifi-legacy-migration.test.ts (2 tests) 16ms
 ✓ lib/brain/redact.test.ts (36 tests) 13ms
 ✓ test/concierge-credential-pipeline.test.ts (10 tests) 14ms
 ✓ test/guest-concierge-history-safety.test.ts (7 tests) 40ms
stderr | lib/guest/service-request-interview.test.ts > runInterviewTurn > falls back to a generic follow-up question on unparseable model output
{"level":"warn","msg":"service_request_interview_parse_failed","meta":{"rawLength":15,"atCap":false},"ts":"2026-09-08T14:31:18.520Z"}

stderr | lib/guest/service-request-interview.test.ts > runInterviewTurn > falls back to a minimal final report on unparseable output once the question cap is hit
{"level":"warn","msg":"service_request_interview_parse_failed","meta":{"rawLength":15,"atCap":true},"ts":"2026-09-08T14:31:18.522Z"}

stderr | lib/guest/service-request-interview.test.ts > runInterviewTurn > falls back to a generic question when the completion call throws
{"level":"warn","msg":"service_request_interview_completion_failed","meta":{"error":"Error: network down","atCap":false},"ts":"2026-09-08T14:31:18.522Z"}

 ✓ lib/guest/service-request-interview.test.ts (13 tests) 13ms
 ✓ lib/local/ranking.test.ts (4 tests) 10ms
 ✓ lib/billing/entitlements.test.ts (32 tests) 11ms
 ✓ lib/crypto.visit-code.test.ts (8 tests) 9ms
 ✓ lib/net/ssrf.test.ts (15 tests) 13ms
 ✓ lib/concierge/tone.test.ts (35 tests) 10ms
 ✓ lib/retrieval/ordering-divergence.test.ts (20 tests) 11ms
 ✓ lib/brain/guest-answer-learning.test.ts (7 tests) 14ms
 ✓ test/messaging-readiness.test.ts (18 tests) 8ms
 ✓ lib/brain/values.test.ts (11 tests) 7ms
 ✓ lib/property-import/extract.test.ts (19 tests) 12ms
 ✓ lib/env-sms.test.ts (7 tests) 23ms
 ✓ test/guest-chat-history-window.test.ts (7 tests) 12ms
 ✓ lib/guest/languages.test.ts (18 tests) 19ms
 ✓ test/notification-preferences.test.ts (18 tests) 12ms
 ✓ lib/local/validation.test.ts (15 tests) 24ms
 ✓ test/release-property-brain.test.ts (8 tests) 23ms
 ✓ lib/dashboard/profile-nav.test.ts (14 tests) 13ms
 ✓ lib/brain/wifi-registry.test.ts (4 tests) 9ms
 ✓ lib/storage/cover-image.test.ts (19 tests) 14ms
 ✓ lib/ai/redaction.test.ts (28 tests) 14ms
 ✓ lib/auth/roles.test.ts (10 tests) 8ms
 ✓ lib/brain/taxonomy.test.ts (15 tests) 14ms
 ✓ lib/storage/s3.unconfigured.test.ts (2 tests) 3ms
 ✓ lib/guest/linkify.test.ts (16 tests) 12ms
 ✓ lib/ai/ollama.test.ts (9 tests) 20ms
 ✓ lib/normalizer/index.test.ts (2 tests) 23ms
stderr | lib/billing/founding.test.ts > isFoundingCouponRedeemable > degrades to full price instead of throwing when the lookup fails
{"level":"warn","msg":"founding_coupon_lookup_failed","meta":{"couponId":"founding-host-50-12mo","error":"stripe unreachable"},"ts":"2026-09-08T14:31:26.354Z"}

stderr | lib/billing/founding.test.ts > isFoundingCouponRedeemable > does not rethrow a non-Error rejection
{"level":"warn","msg":"founding_coupon_lookup_failed","meta":{"couponId":"founding-host-50-12mo","error":"string failure"},"ts":"2026-09-08T14:31:26.356Z"}

 ✓ lib/billing/founding.test.ts (13 tests) 13ms
 ✓ lib/billing/meters.test.ts (9 tests) 10ms
 ✓ lib/dashboard/extras-orders.test.ts (15 tests) 14ms
 ✓ test/property-workspace.test.ts (5 tests) 4ms
stderr | lib/properties/purge.test.ts
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715

 ✓ lib/properties/purge.test.ts (11 tests) 16ms
 ✓ lib/router/providerAllowlist.test.ts (17 tests) 7ms
 ✓ test/brain-page-structure.test.ts (19 tests) 14ms
 ✓ lib/brain/autopilot.test.ts (13 tests) 8ms
 ✓ lib/dashboard/breadcrumbs.test.ts (14 tests) 7ms
 ✓ lib/local/nearby.test.ts (6 tests) 8ms
 ✓ lib/local/mapbox.test.ts (4 tests) 11ms
stderr | lib/rate-limit.test.ts > checkRateLimit > fails open on a counter read error
{"level":"warn","msg":"rate_limit_count_failed","meta":{"action":"test","error":"db down"},"ts":"2026-09-08T14:31:30.807Z"}

 ✓ lib/rate-limit.test.ts (4 tests) 13ms
 ✓ test/messaging-login-deeplink.test.ts (1 test) 22ms
 ✓ lib/guest/concierge.test.ts (14 tests) 20ms
 ✓ test/messaging-escalation-actions.test.ts (4 tests) 21ms
 ✓ lib/ingest/segment.test.ts (9 tests) 6ms
 ✓ lib/property-import/appliance-safety.test.ts (2 tests) 5ms
 ✓ test/guest-portal-a11y.test.ts (9 tests) 10ms
 ✓ lib/dashboard/knowledge-queue-link.test.ts (9 tests) 7ms
 ✓ lib/brain/readiness.test.ts (7 tests) 6ms
 ✓ lib/brain/freshness.test.ts (12 tests) 6ms
 ✓ trigger/ping.test.ts (5 tests) 6ms
 ✓ lib/auth/member-capabilities.test.ts (6 tests) 6ms
 ✓ lib/local/curation.test.ts (8 tests) 16ms
 ✓ lib/dashboard/nav-active.test.ts (9 tests) 6ms
 ✓ lib/local/recovery.test.ts (6 tests) 5ms
 ✓ test/extras-request-number.test.ts (3 tests) 9ms
 ✓ lib/validation.signup.test.ts (3 tests) 11ms
 ✓ test/extras-lifecycle.test.ts (4 tests) 11ms
 ✓ lib/local/dedupe.test.ts (7 tests) 4ms
 ✓ lib/env.test.ts (5 tests) 53ms
 ✓ test/messaging-ui-contract.test.ts (4 tests) 10ms
 ✓ lib/property-import/attestation.test.ts (7 tests) 19ms
 ✓ lib/ingest/sensitivity.test.ts (6 tests) 5ms
 ✓ test/breadcrumbs.test.ts (4 tests) 7ms
 ✓ lib/billing/usage.test.ts (4 tests) 4ms
 ✓ test/dashboard-scope.test.ts (4 tests) 6ms
 ✓ lib/dashboard/lifecycle.test.ts (7 tests) 3ms
 ✓ lib/property-import/migrations.test.ts (2 tests) 6ms
 ✓ lib/storage/s3.test.ts (5 tests) 4ms
 ✓ lib/mail/senders.test.ts (5 tests) 4ms
 ✓ test/extras-migration-policy.test.ts (3 tests) 3ms
 ✓ test/stay-portal-status.test.ts (4 tests) 3ms
 ✓ lib/design/form-contrast.test.ts (3 tests) 34ms
 ✓ lib/local/canonical.test.ts (2 tests) 14ms
 ✓ test/service-request-lifecycle.test.ts (2 tests) 3ms
 ✓ test/acquisition-migration.test.ts (3 tests) 7ms
 ✓ test/dashboard-cards.test.ts (2 tests) 11ms
 ✓ test/wifi-registry-migration.test.ts (2 tests) 3ms
 ✓ lib/dashboard/escalations-permissions.test.ts (3 tests) 3ms
 ✓ test/escalation-inbox-routes.test.ts (2 tests) 3ms

 Test Files  117 passed (117)
      Tests  1472 passed (1472)
   Start at  14:30:56
   Duration  63.38s (transform 2.14s, setup 0ms, collect 19.39s, tests 6.00s, environment 29ms, prepare 12.36s)
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
  77:27  warning  Error: Cannot call impure function during render

`Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render. (https://react.dev/reference/rules/components-and-hooks-must-be-pure#components-and-hooks-must-be-idempotent).

/home/user/workspace/moche-app/app/dashboard/page.tsx:77:27
  75 |   let nextArrival: { guestName: string; propertyName: string | null; checkIn: string } | null = null;
  76 |   if (propertyIds.length > 0) {
> 77 |     const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
     |                           ^^^^^^^^^^ Cannot call impure function
  78 |     const [{ count: stayCount }, { data: brainItems }, { data: arrivals }] = await Promise.all([
  79 |       supabase.from('stays').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).eq('status', 'active'),
  80 |       supabase.from('brain_items').select('category, status, deleted_at, visibility, property_id').in('property_id', propertyIds),  react-hooks/purity

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
  179:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/profile/billing/BillingActions.tsx:179:5
  177 |   useEffect(() => {
  178 |     if (!open || elig || loading) return;
> 179 |     setLoading(true);
      |     ^^^^^^^^^^ Avoid calling setState() directly within an effect
  180 |     fetch('/api/stripe/refund', { method: 'GET' })
  181 |       .then(async (res) => {
  182 |         const data = (await res.json()) as Eligibility & { error?: string };  react-hooks/set-state-in-effect

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

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/BrainManager.tsx
  174:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

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
  177 |         .getElementById(`brain-item-${editItemId}`)  react-hooks/set-state-in-effect

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
  56:51  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/add/AddKnowledgeClient.tsx:56:51
  54 |   // Adopt a finished rewrite exactly once per result.
  55 |   useEffect(() => {
> 56 |     if (improveState.ok && improveState.improved) setBody(improveState.improved);
     |                                                   ^^^^^^^ Avoid calling setState() directly within an effect
  57 |   }, [improveState]);
  58 |
  59 |   const saved = saveState.ok === true;  react-hooks/set-state-in-effect
  62:5   warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/brain/add/AddKnowledgeClient.tsx:62:5
  60 |   useEffect(() => {
  61 |     if (!saved) return;
> 62 |     setTitle('');
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  63 |     setBody('');
  64 |     router.refresh();
  65 |   }, [saved, router]);                                                                                                                                              react-hooks/set-state-in-effect

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

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/StayGuestsManager.tsx
  42:5  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/dashboard/properties/[id]/guest-chat/StayGuestsManager.tsx:42:5
  40 |
  41 |   useEffect(() => {
> 42 |     setError(null);
     |     ^^^^^^^^ Avoid calling setState() directly within an effect
  43 |     void loadGuests();
  44 |   }, [loadGuests]);
  45 |  react-hooks/set-state-in-effect

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
  158:28  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/AiChatWorkflow.tsx:158:28
  156 |   // language like every other surface.
  157 |   useEffect(() => {
> 158 |     if (props.hostPreview) setCards(fallbackCards(t));
      |                            ^^^^^^^^ Avoid calling setState() directly within an effect
  159 |   }, [props.hostPreview, t]);
  160 |
  161 |   const loadHistory = useCallback(async () => {  react-hooks/set-state-in-effect
  171:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          react-hooks/exhaustive-deps
  174:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/AiChatWorkflow.tsx:174:10
  172 |
  173 |   useEffect(() => {
> 174 |     void loadHistory();
      |          ^^^^^^^^^^^ Avoid calling setState() directly within an effect
  175 |     if (props.hostPreview) return;
  176 |     const timer = window.setInterval(() => void loadHistory(), 8000);
  177 |     return () => window.clearInterval(timer);               react-hooks/set-state-in-effect
  215:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          react-hooks/exhaustive-deps

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
  90:9  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/GuestPortal.tsx:90:9
  88 |       const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  89 |       if (stored && resolveLanguage(stored)) {
> 90 |         setLanguageState(stored);
     |         ^^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  91 |         return;
  92 |       }
  93 |       const browser = resolveLanguage(window.navigator.language);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/HostChatWorkflow.tsx
  117:6   warning  React Hook useCallback has a missing dependency: 'props'. Either include it or remove the dependency array. However, 'props' will change when *any* prop changes, so the preferred fix is to destructure the 'props' object outside of the useCallback call and refer to those specific props inside useCallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  react-hooks/exhaustive-deps
  121:10  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/HostChatWorkflow.tsx:121:10
  119 |   useEffect(() => {
  120 |     if (hostPreview) return;
> 121 |     void load();
      |          ^^^^ Avoid calling setState() directly within an effect
  122 |     const timer = window.setInterval(() => void load(), 5000);
  123 |     return () => window.clearInterval(timer);
  124 |   }, [load, hostPreview]);                                                                                                                                     react-hooks/set-state-in-effect
  132:9   warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/HostChatWorkflow.tsx:132:9
  130 |       const target = messages.find((m) => m.id === props.initialMessageId);
  131 |       if (target?.escalationId && !openCards[target.escalationId]) {
> 132 |         setOpenCards((cards) => ({ ...cards, [target.escalationId!]: true }));
      |         ^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  133 |         return;
  134 |       }
  135 |       const el = document.getElementById(`message-${props.initialMessageId}`);  react-hooks/set-state-in-effect

/home/user/workspace/moche-app/app/g/[slug]/MaintenanceWorkflow.tsx
  58:7  warning  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/home/user/workspace/moche-app/app/g/[slug]/MaintenanceWorkflow.tsx:58:7
  56 |   useEffect(() => {
  57 |     if (hostPreview) {
> 58 |       setChecked(true);
     |       ^^^^^^^^^^ Avoid calling setState() directly within an effect
  59 |       return;
  60 |     }
  61 |     let cancelled = false;  react-hooks/set-state-in-effect

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

✖ 57 problems (0 errors, 57 warnings)
  0 errors and 5 warnings potentially fixable with the `--fix` option.
```

## Typecheck

```text
> moche-app@0.1.0 typecheck
> tsc --noEmit
```

## Registry, seed, and golden drift

```text
[registry-check] ok — field_registry.json matches generator: 55 fields, 49 scored, 14 domains
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
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:82: NOTICE:  PASS  A1 registry materialized with every declared field  (= 55)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:86: NOTICE:  PASS  A2 exactly six hard-block fields (Section 5.3)  (= 6)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:91: NOTICE:  PASS  A3 no system-section field carries scoring weight  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:95: NOTICE:  PASS  A4 every secret-typed field routes to Vault (Section 3.2)  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:103: NOTICE:  PASS  A5 every on_failure_field resolves to a declared field  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:109: NOTICE:  PASS  A6 every registry default_audience satisfies the compatibility matrix  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:118: NOTICE:  PASS  A7 registry rejects a secret tier addressed to a public guest surface  (rejected: new row for relation "field_registry" violates check constraint "field_registry_audience_m)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:128: NOTICE:  PASS  A8 registry rejects a scored system-section field  (rejected: new row for relation "field_registry" violates check constraint "field_registry_system_uns)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:135: NOTICE:  PASS  A9 both Wi-Fi guidance fields are declared guest-safe text  (= 2)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:142: NOTICE:  PASS  A10 legacy Wi-Fi password stays secret but is not collected or scored  (= 1)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:153: NOTICE:  PASS  B1 positive control: a well-formed public fact is accepted
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:160: NOTICE:  PASS  B2 positive control: a Vault-pointer secret is accepted
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:167: NOTICE:  PASS  B3 a stay-scoped secret cannot be stored as plaintext jsonb (Section 6)  (rejected: field wifi_password is secret-typed and requires secret_ref_or_ciphertext)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:174: NOTICE:  PASS  B4 a row cannot carry both a value and a secret pointer  (rejected: new row for relation "brain_values" violates check constraint "brain_values_payload_exclus)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:181: NOTICE:  PASS  B5 a row cannot be empty of both payload columns  (rejected: new row for relation "brain_values" violates check constraint "brain_values_payload_exclus)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:189: NOTICE:  PASS  B6 a door/Wi-Fi secret cannot be addressed to a pre-arrival surface  (rejected: field wifi_password may not be addressed to guest_prearrival (registry default is guest_in)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:196: NOTICE:  PASS  B7 a host_only fact cannot be addressed to any guest surface  (rejected: field utility_shutoff_locations may not be addressed to guest_instay (registry default is )
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:204: NOTICE:  PASS  B8a positive control: quiet_hours accepted at its registry tier
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:209: NOTICE:  PASS  B8b a caller cannot relabel a field's tier away from the registry  (rejected: field quiet_hours is tier public_guest, cannot be written as host_only)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:217: NOTICE:  PASS  B9 positive control: a fact may be addressed more narrowly than the default
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:224: NOTICE:  PASS  B10 a fact cannot be addressed wider than its registry default  (rejected: field area_safety_notes may not be addressed to guest_public (registry default is guest_pr)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:231: NOTICE:  PASS  B11 an undeclared field_id is rejected  (rejected: field_id not_a_real_field is not declared in field_registry)
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:238: NOTICE:  PASS  B12 a second active value for the same field is rejected  (rejected: duplicate key value violates unique constraint "brain_values_one_active_per_field")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:244: NOTICE:  PASS  B13 ttl_expires_at is populated from registry ttl_days  (= t)
 expect_eq 
-----------
 
(1 row)

INSERT 0 1
SET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:265: NOTICE:  PASS  C0 POSITIVE CONTROL: an editor does see their own property's facts  (= 4)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:270: NOTICE:  PASS  C1 a member of property A sees zero rows from property B  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:274: NOTICE:  PASS  C2 an unqualified SELECT returns only in-tenant rows  (= 4)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:281: NOTICE:  PASS  C3 cannot INSERT a fact into a foreign property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:289: NOTICE:  PASS  C4 cannot move an owned fact into a foreign property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:294: NOTICE:  PASS  C5 cannot UPDATE a foreign property's fact  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:299: NOTICE:  PASS  C6 cannot DELETE a foreign property's fact  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:306: NOTICE:  PASS  C7 a user with no membership anywhere sees nothing  (= 0)
 expect_eq 
-----------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:312: NOTICE:  PASS  C8 POSITIVE CONTROL: a viewer reads their own property's facts  (= 4)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:319: NOTICE:  PASS  C9 a viewer cannot write to their own property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:324: NOTICE:  PASS  C10 a viewer cannot update their own property  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:330: NOTICE:  PASS  C11 an unauthenticated session sees nothing  (= 0)
 expect_eq 
-----------
 
(1 row)

RESET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:338: NOTICE:  PASS  C12 authenticated cannot mutate the registry  (rejected: permission denied for table field_registry)
 expect_fail 
-------------
 
(1 row)

RESET
INSERT 0 2
SET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:356: NOTICE:  PASS  D1 positive control: editor sees only their own Wi-Fi location  (= 1)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:360: NOTICE:  PASS  D2 foreign property Wi-Fi location is not visible  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:366: NOTICE:  PASS  D3 editor cannot write connection instructions on a foreign property  (rejected: new row violates row-level security policy for table "brain_values")
 expect_fail 
-------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:370: NOTICE:  PASS  D4 unassigned user cannot read Wi-Fi guidance  (= 0)
 expect_eq 
-----------
 
(1 row)

RESET
RESET
INSERT 0 3
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:399: NOTICE:  PASS  E1 brain_items.section is nullable so legacy rows need no backfill  (= YES)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:407: NOTICE:  PASS  E2 an invented section is rejected by the CHECK constraint  (rejected: new row for relation "brain_items" violates check constraint "brain_items_section_check")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:412: NOTICE:  PASS  E3 a system domain is not a valid host-facing section  (rejected: new row for relation "brain_items" violates check constraint "brain_items_section_check")
 expect_fail 
-------------
 
(1 row)

SET
SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:420: NOTICE:  PASS  E4 POSITIVE CONTROL: an editor sees exactly their own property's Brain rows  (= 2)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:425: NOTICE:  PASS  E5 POSITIVE CONTROL: an editor can file a row into a section
 expect_ok 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:430: NOTICE:  PASS  E6 POSITIVE CONTROL: an editor can re-section their own row  (1 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:437: NOTICE:  PASS  E7 a foreign property's Brain rows are invisible  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:442: NOTICE:  PASS  E8 cannot re-section a foreign property's Brain row  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:447: NOTICE:  PASS  E9 cannot DELETE a foreign property's Brain row  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:454: NOTICE:  PASS  E10 cannot move an owned Brain row into a foreign property  (rejected: new row violates row-level security policy for table "brain_items")
 expect_fail 
-------------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:459: NOTICE:  PASS  E11 cannot insert a Brain row into a foreign property  (rejected: new row violates row-level security policy for table "brain_items")
 expect_fail 
-------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:466: NOTICE:  PASS  E12 a user with no membership anywhere sees no Brain rows  (= 0)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:471: NOTICE:  PASS  E13 an unassigned user cannot file a Brain row  (rejected: new row violates row-level security policy for table "brain_items")
 expect_fail 
-------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:477: NOTICE:  PASS  E14 POSITIVE CONTROL: a viewer reads their own property's Brain rows  (= 3)
 expect_eq 
-----------
 
(1 row)

psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:482: NOTICE:  PASS  E15 a viewer cannot re-section their own property's rows  (0 rows affected)
 expect_affected 
-----------------
 
(1 row)

SET
psql:/home/user/workspace/moche-app/scripts/gate2-contract-tests.sql:487: NOTICE:  PASS  E16 an unauthenticated session sees no Brain rows  (= 0)
 expect_eq 
-----------
 
(1 row)

RESET
== all contract tests passed ==
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

## Actual migration rollback and idempotency

```text
Offline SQL evidence: /tmp/property-brain-release-sql.aSfDYR
PASS: final assertion failure rolls back both actual migrations
PASS: actual release succeeds with its final assertions
PASS: actual release is idempotent
PASS: real messaging authorization and proof contracts
PROPERTY BRAIN RELEASE SQL VERIFIED
```

## Local Recs browser tests

```text
Running 5 tests using 1 worker

  ✓  1 test/local-recs-ui/local-recs.spec.ts:8:5 › failed save retains every draft field, especially guest visibility (2.4s)
  ✓  2 test/local-recs-ui/local-recs.spec.ts:22:5 › map click populates a manual point, while clear and cancel preserve details (600ms)
  ✓  3 test/local-recs-ui/local-recs.spec.ts:36:5 › keyboard selects a hidden pin and saving updates its card and popup note (539ms)
  ✓  4 test/local-recs-ui/local-recs.spec.ts:46:5 › temporary search selection never prefills the manual form (1.2s)
  ✓  5 test/local-recs-ui/local-recs.spec.ts:63:5 › a map failure leaves manual entry usable (569ms)

  5 passed (7.0s)
```

## Guest messaging desktop and mobile browser tests

```text
Running 2 tests using 1 worker

  ✓  1 [desktop] › test/messaging-ui/recovery.spec.ts:3:5 › own consent + phone OTP, explicit recovery, exact focus, and workflow warning (1.5s)
  ✓  2 [mobile] › test/messaging-ui/recovery.spec.ts:3:5 › own consent + phone OTP, explicit recovery, exact focus, and workflow warning (2.0s)

  2 passed (9.8s)
```

## Production build with fake public environment

```text
> moche-app@0.1.0 build
> next build

▲ Next.js 16.3.0 (Turbopack)
✓ Running next.config.mjs took 1100ms
- Experiments (use with caution):
  · clientTraceMetadata

⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.

  To migrate automatically, run:
  npx @next/codemod@canary middleware-to-proxy .

  Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
  Creating an optimized production build ...
✓ Compiled successfully in 38.4s
  Running next.config.js provided runAfterProductionCompile ...
✓ Completed runAfterProductionCompile in 1774ms
  Running TypeScript ...
✓ Finished writing to filesystem cache in 17.5s
  Finished TypeScript in 40s ...
  Collecting page data using 1 worker ...
✓ Finished filesystem cache database compaction in 25.1s
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715
⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715
  Generating static pages using 1 worker (0/34) ...
  Generating static pages using 1 worker (8/34) 
  Generating static pages using 1 worker (16/34) 
  Generating static pages using 1 worker (25/34) 
✓ Generating static pages using 1 worker (34/34) in 1604ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ○ /about
├ ƒ /answer/[token]
├ ƒ /api/cron/freshness-digest
├ ƒ /api/csp-report
├ ƒ /api/geo/autocomplete
├ ƒ /api/guest/[slug]/appliances
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
├ ƒ /api/guest/[slug]/places/[id]
├ ƒ /api/guest/[slug]/register
├ ƒ /api/guest/[slug]/service-request/[id]/message
├ ƒ /api/guest/[slug]/service-request/[id]/upload
├ ƒ /api/guest/[slug]/service-request/start
├ ƒ /api/guest/[slug]/service-requests
├ ƒ /api/guest/[slug]/stay-guest/register
├ ƒ /api/guest/[slug]/verify/confirm
├ ƒ /api/guest/[slug]/verify/start
├ ƒ /api/host/properties/[id]/extras-orders/[orderId]/status
├ ƒ /api/host/properties/[id]/guest-chats
├ ƒ /api/host/properties/[id]/guest-chats/[conversationId]/messages
├ ƒ /api/host/properties/[id]/guest-chats/announcements
├ ƒ /api/host/properties/[id]/guest-chats/permissions
├ ƒ /api/host/properties/[id]/links
├ ƒ /api/host/properties/[id]/links/[linkId]/regenerate-code
├ ƒ /api/host/properties/[id]/links/[linkId]/revoke-code
├ ƒ /api/host/properties/[id]/local/search
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
├ ƒ /api/host/properties/[id]/stays/[stayId]/share
├ ƒ /api/internal/integrations/readiness
├ ƒ /api/legal/accept
├ ƒ /api/legal/delete
├ ƒ /api/legal/export
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
├ ƒ /g/[slug]/local
├ ○ /guest-experience
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
