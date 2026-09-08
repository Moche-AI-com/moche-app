# Integration readiness

## Safe production verification

Sign in with an existing founder account, open the production app, and run this
same-origin browser-console command. Do not copy session cookies or provider keys.

```js
fetch('/api/internal/integrations/readiness', {
  method: 'GET',
  credentials: 'same-origin',
  cache: 'no-store',
}).then(async (response) => ({
  status: response.status,
  readiness: response.ok ? await response.json() : null,
})).then(console.log);
```

The endpoint checks the protected `isFounder` session claim before provider reads;
anonymous users and tenant-only owners/admins receive an empty 404. Its response is
private/no-store. It performs no database writes, sends no email/SMS, starts no
Trigger task, and changes no provider configuration. Provider reads use fixed
destinations, reject redirects, and have six-second timeouts. Responses contain
only configuration booleans and allowlisted statuses, not keys, contacts, DNS
records, deployment IDs, or raw errors.

SMS `deliveryEnabled` uses `serverEnv.smsDeliveryEnabled`: `NODE_ENV=production`,
`VERCEL_ENV=production`, and `NOTIFY_SMS_ENABLED=true` must all hold. Credentials and
sender must also resolve for `transportConfigured`. This verifies configuration,
not delivery, consent, or provider approval.

`sms.inboundWebhook` reads one existing Twilio sender resource using
`GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json`
with an exact E.164 `PhoneNumber` filter and `PageSize=1`. The account SID is
validated before URL construction; existing resolved Basic authentication is used.
It compares `sms_url` and `sms_method` to the canonical public application
`/api/webhooks/twilio` URL and `POST`, returning booleans only. A TwiML application
override prevents a positive callback match. Read 401/403 is `not_authorized`, not
proof that sending is broken. No number, URL, SID, raw payload, or auth header is
returned. This checks wiring only, not execution, signature credentials, database
permissions, or STOP persistence. API contract:
https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource

Resend uses `GET https://api.resend.com/domains` and examines only the configured
application domain. A sending-only API key can return 403 for domain reads while
remaining valid for sending; `not_authorized` is therefore inconclusive about send
authorization. The endpoint does not call the mutating domain-verification API.
Pagination is reported as `hasMore`; absence from a partial page is not proof the
domain is absent. API contract:
https://resend.com/docs/api-reference/domains/list-domains

Trigger uses `GET https://api.trigger.dev/api/v1/deployments?page%5Bsize%5D=5`
with the existing production environment secret only. A deployed version does not
prove that the `ping` task is registered or executable. Task catalog, execution,
and native GitHub integration remain explicitly unchecked. No management token is
required or created by this route. API contract:
https://trigger.dev/docs/management/deployments/list

## Freshness digest cron

`vercel.json` schedules `/api/cron/freshness-digest` at `0 14 * * 1` (Monday,
14:00 UTC). The deployed production runtime requires a nonempty `CRON_SECRET` and
`RESEND_API_KEY`; without the cron secret the route fails closed.

The authorized owner must configure `CRON_SECRET` as a sensitive production-only
Vercel environment variable, then deploy so the runtime receives it. Never put its
value in source, documents, command output, browser code, logs, or tests. Vercel
supplies it in the scheduled request's Authorization header.

Verify only `cron.configured` through the readiness endpoint after deployment.
**Do not manually call the digest route for readiness:** an authorized call can
send email. Likewise, do not run `scripts/verify-trigger-retry.mjs` for a read-only
check; it starts task executions.

## Offline regression checks

From the repository root, with no production credentials:

```sh
env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test CI=1 \
  node node_modules/vitest/vitest.mjs run \
  test/integration-readiness.test.ts test/integration-send-safety.test.ts \
  trigger/ping.test.ts lib/mail/senders.test.ts \
  --no-file-parallelism --maxWorkers=1 --no-cache
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

All external provider and persistence calls in these targeted route tests are
mocked. Readiness GETs are bounded; existing Resend SDK send paths retain their
existing request-timeout behavior rather than introducing a non-cancelling race.
