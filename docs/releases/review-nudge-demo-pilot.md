# Review Nudge demo pilot

This pilot supersedes the initial PR's global-enable release instructions. V2 requires a service-only app_settings row keyed review_nudge_v2:<authenticated property UUID>, with enabled strictly true. REVIEW_NUDGE_V2_ENABLED=false is a kill switch; setting it true alone does not opt in any property. A missing/disabled property flag routes GET and POST to the preserved v1 API and selects the preserved v1 guest component. A rollout-read failure hides feedback instead of guessing the cohort.

For a demo without paid entitlement, allow_demo must explicitly be true and the existing isGuestAiEnabled server helper must also confirm access. That helper does not permit a demo grant to override an existing canceled/read-only subscription. No subscription or billing record is created or changed. The rollout row is resolved from the authenticated guest session's property, never browser-supplied scope.

The demo destination is /review-demo. It submits no public review and does not imply private feedback persistence. The test-link label is shown only when demo_review is true and the validated URL is exactly https://www.moche-ai.com/review-demo. No guest rating/comment is sent to the destination URL.

Apply and validate the migration before enabling a cohort. Deploy the code with no cohort enabled, verify the test page, and then separately approve the resolved demo-property settings and rollout row. Main merge, database migration, and production configuration are separate approval-gated actions. Other properties and both draft demo properties stay unchanged. Removing/disabling the cohort preserves v2 audit terminal markers in the legacy suppression check, preventing rollback from intentionally rearming a completed session.

The new API tests use mocks: they cover routing, demo grant requirements, scope resolution, input validation, persistence error responses, and rate limiting. They do not prove SQL concurrency, RLS, browser idle timing, or production end-to-end behavior. Existing v1 defects remain outside the pilot; broad production sign-off still requires feature-specific SQL/browser tests, host settings copy and localization review.
