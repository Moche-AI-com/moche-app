# Offline AI workflow browser checks

Runs the **actual client components**, not a rewritten sample UI:

- `AddKnowledgeClient`: AI drafting, explicit save, indexing warning/retry, pasted notes, URL and file imports.
- `EscalationAnswerForm`: default Auto and manual category submissions, learning opt-out, reply-only controls.
- `MaintenanceWorkflow`: question/choice/completion flow and visible terminal safety guidance.
- `ListingImportKickoff`: setup-import warning/error survives URL cleanup; refreshing cannot repeat the import.

## Run

From the repository root, with the existing dependencies and Chromium available:

```sh
node node_modules/@playwright/test/cli.js test --config=test/ai-workflows-ui/playwright.config.ts
```

The config runs desktop Chromium and the Pixel 7 Chromium emulation, with two workers and no retries. It starts and stops a local-only server on **127.0.0.1:3221**. Do not run two copies concurrently; an occupied port fails instead of silently using a stale fixture.

Evidence defaults to `test-results/ai-workflows-ui`. Choose an external directory when needed:

```sh
node node_modules/@playwright/test/cli.js test \
  --config=test/ai-workflows-ui/playwright.config.ts \
  --output=/home/user/workspace/ai-workflows-ui-evidence/final
```

Each case saves a desktop/mobile screenshot and `mock-only-browser-log.json`. Indexing and setup warning tests also save their warning state before retry/reload. Failed cases retain Playwright traces.

## Isolation and fidelity

- Esbuild bundles real source components and their non-server dependencies in memory.
- The three server actions are replaced **only at the module boundary**. Real React form submission supplies `FormData`; the bridge posts it to a labelled `/__mock/actions/*` endpoint so tests can inspect the submitted fields.
- Next's compiled React/React DOM are used, following `test/local-recs-ui`. Root React 18 does not support the `useActionState` hook used by the actual knowledge component.
- Every API/action request must have an explicit Playwright response. External or unconfigured requests fail the test. The HTTP fixture also rejects every non-static route, and its content security policy prohibits external connections.
- No environment files, credentials, Next server, authentication, database, provider, SMS, or external page fetching are used. The synthetic `.invalid` URLs are input strings, never destinations.
- Actual `FormFeedback`, taxonomy, notification notice, English portal strings, global styles and portal styles are retained. The Next router and links are narrow stubs.
- The setup wrapper mirrors the real server parent's conditional `?import` mount. Mock `router.replace` reconciles that condition; native `history.replaceState` changes only the URL. This specifically detects the warning-unmount regression without starting the server parent or its data clients.

## Contracts protected

1. Improving a draft does not call save. The host can review/edit before submitting.
2. AI/save failures retain draft text, title, section and visibility.
3. A saved-but-unindexed `warning` preserves the draft, avoids indexed-success copy, and retries the returned `itemId`.
4. A `truncated: true` paste response keeps **every original character**, title and category.
5. Import controls and feedback describe review; URL failures retain their inputs.
6. The initial escalation selection submits `brainCategory: "auto"`; explicit choices reach the action unchanged. Opt-out/reply-only submissions carry no learning controls.
7. Guest Needs renders question choices and final summary; safety completion shows returned guidance without a further composer. The additional maintenance safety spec covers escaped text, reset, and missing-guidance fallback.
8. Setup URL cleanup retains the visible warning/error and unrelated query/hash; reload does not submit again.

## Limitations

This is **offline browser component coverage**, not production end-to-end certification. It does not exercise server-action validation, category routing/normalization, authorization/RLS, provider selection, model quality, indexing durability, proposal writes/approval, actual notification delivery, or the backend interview cap/safety classifier. Those require the separate action/route/unit suites.

The setup test models server-parent reconciliation; it does not execute a live Next App Router transition. Links and router refresh are mocked, so no navigation/data-refresh correctness is claimed beyond the tested mount contract.

Screenshots use the real component styles with minimal fixture framing, system-font fallback and a border-box reset; Tailwind directives are not compiled. They are diagnostic evidence, not a full production visual baseline. Mobile is Chromium device emulation, not physical Android or iOS Safari.

Development console output includes the existing `EscalationAnswerForm` `useFormState` deprecation and intentionally mocked HTTP 502 failures. Logs retain those notices; unexpected requests and uncaught page errors fail the suite.
