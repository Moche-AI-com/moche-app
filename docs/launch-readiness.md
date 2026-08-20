# Launch readiness notes

Working notes for the pre-launch hardening pass. Each section records what was
checked, what the evidence was, and what a human still has to do. Anything under
"Owner: human" cannot be done from code or from an API token.

## Hosting / deploy state

**Two Vercel projects exist and both deploy successfully:** `moche-app` and
`moche-app-aqbb`, both under the `moche-ai` team, both wired to this repository
as GitHub commit checks. `push_env_to_aqbb.sh` in the repo root pushes env vars
to the `-aqbb` project and forces `APP_URL` / `NEXT_PUBLIC_APP_URL` to
`https://www.moche-ai.com`.

### Resolved: `moche-app` is production

`vercel inspect` on each project's latest production deployment settles it. The
`moche-app` deployment holds the aliases:

```
https://www.moche-ai.com
https://moche-ai.com
https://moche-app.vercel.app
```

The `moche-app-aqbb` deployment holds only `*.vercel.app` aliases and no custom
domain. `moche-app` also carries 61 production env vars against `-aqbb`'s 44.

**`moche-app` is production.** `moche-app-aqbb` is a duplicate that serves no
traffic. It is being left in place rather than deleted (deletion is
irreversible and takes its deployment history with it), but it should be
disconnected from the repository so it stops building on every push and stops
adding a second, env-incomplete commit check to every PR. `push_env_to_aqbb.sh`
is dead once that happens.

**Owner: human (optional).** Disconnect the Git integration on
`moche-app-aqbb`, or delete the project outright, and remove
`push_env_to_aqbb.sh`.

### A tooling discrepancy worth knowing about

`vercel projects ls --scope moche-ai` and `vercel ls`, run with the
agent-provided `VERCEL_TOKEN`, both reported **zero projects and zero
deployments**. That is wrong, and it was only caught because the GitHub checks on
PR #16 showed two Vercel deployments reporting back.

So the token can authenticate (`vercel whoami` and `vercel teams ls` both
succeed and resolve the `moche-ai` team) but cannot enumerate that team's
projects. Most likely an access-scope limitation on the token itself.

**Practical rule: do not trust `vercel projects ls` with this token as evidence
that something does not exist.** Read the deployment checks on a PR, or the
dashboard, instead.

`vercel domains inspect` also fails outright with "You are not allowed to access
this endpoint." `vercel link --project <name>` and `vercel inspect <url>` both
work, so name the project explicitly rather than trying to enumerate.

Note that `lib/env.ts` reads every secret lazily, so a missing var produces a
successful build and a runtime failure, which is the worst failure shape. Verify
env vars by reading them back, not by observing a green build.

## Supabase auth: leaked-password protection

`get_advisors(type=security)` reports `auth_leaked_password_protection` as a
WARN. This checks submitted passwords against the HaveIBeenPwned corpus and
rejects known-breached ones.

There is no API or MCP tool for Supabase auth configuration; it is a dashboard
toggle only.

**Owner: human.** Supabase dashboard, Authentication, Policies, enable "Leaked
password protection".

## Known-accepted advisor warnings

After the P0 security pass (see `supabase-migrations-P0-SECURITY.sql`), the
security advisor is down from 6 `anon_security_definer_function_executable`
warnings to 0. What remains is deliberate:

| Advisor finding | Count | Why it is accepted |
|---|---|---|
| `authenticated_security_definer_function_executable` | 6 | Five self-scoped boolean helpers (`can_access_property`, `can_edit_property`, `is_account_member`, `is_account_owner`, `is_admin`). Each answers only "may *the calling user* do X", so a signed-in caller learns nothing they could not learn from their own row access. They are referenced by many tracked migration files; relocating them to the `private` schema is a follow-up with real blast radius, not a launch blocker. The sixth is `account_conversation_usage`, which must be callable by signed-in users because that is how a host reads their own usage meter. It takes an account id and immediately checks `is_account_member(p_host_account_id)`, raising unless the caller belongs to that account; only `service_role` skips the check. So a signed-in caller can read their own usage and nobody else's. |
| `rls_enabled_no_policy` | 2 (INFO) | `app_settings` and `host_otp_challenges` are service-role-only tables. RLS on with no policy is the correct fail-closed configuration: it denies every non-service-role caller. Documented via table `COMMENT`s. |
| `auth_leaked_password_protection` | 1 | Dashboard toggle, see above. |

`public.property_account(uuid)` was **not** accepted. It returned any property's
`host_account_id` to any signed-in caller over `/rest/v1/rpc`, which is a
cross-tenant association leak, so it was moved to the `private` schema. PostgREST
exposes only `public` and `graphql_public`, so `private.*` remains reachable from
RLS policies while having zero REST surface.

## CI

`.github/workflows/ci.yml` is new. Before it, the repository had no `.github`
directory at all: lint, typecheck, and the 16 existing Vitest suites ran only
when someone remembered to run them locally.

The `build` job passes deliberately fake Supabase values. Real secrets must never
be added to this workflow, because it is `pull_request`-triggered and a fork PR
can read workflow secrets.

**Owner: human (optional).** Marking `lint`, `typecheck`, `test`, and `build` as
required status checks on `main` in the GitHub branch-protection settings. CI is
useless as a gate until it is required.

## Activation fee

`ACTIVATION_FEE_USD` / `ACTIVATION_FEE_ENABLED` are removed from code, along with
the `STRIPE_PRICE_ACTIVATION` env read and the `add_invoice_items` branch in
`app/api/stripe/checkout/route.ts`. The flag had been permanently `false` while
still carrying a live code path, which is the kind of dead conditional that gets
flipped on by accident.

**Resolved, nothing to do.** A `GET /v1/prices?active=true` on the live account
returns exactly 10 prices with `has_more: false`, all of them the subscription
prices for the five self-serve tiers. No activation-fee price object was ever
created, so there is nothing to archive.

## Pricing, trial, and entitlements

The pricing grid in `lib/constants.ts` follows the investor pitch deck
(August 2026): per-property pricing with two self-serve tiers and two
contract tiers. The landing-page pricing (`components/landing/Pricing.tsx`)
renders the same numbers.

| Tier | Properties | Price | Channel |
|---|---|---|---|
| Essentials | 1-9 | $29/property/mo · $290/property/yr | self-serve |
| Pro | 1-9 | $49/property/mo · $490/property/yr | self-serve |
| Portfolio | 10-40 | $25-39/property/mo by contract | sales-assisted |
| Enterprise | 41+ | custom | sales-assisted |

Per-property billing is real at checkout: the checkout route sets the Stripe
line-item quantity to the account's active property count (floor 1, so a new
host can start a plan before their first property), and the webhook persists
that quantity on the subscriptions row. `lib/billing/entitlements.ts` then caps
a paid account at the paid quantity (never above the tier's ceiling), so the
plan grid, the checkout, and the enforcement path all read the same model.

Known follow-up: adding a property mid-plan does not yet update the Stripe
quantity automatically. Until that sync ships, a host who outgrows their paid
quantity hits the property cap and contacts support (or upgrades) — the same
interaction they had under flat tiers.

The Founding Member trial is unchanged: 30 days at $0 with top-tier features,
up to 5 properties, card on file up front, once per account.

Guest conversations are unmetered on every plan: there are no allowances and
no per-conversation fees (the pitch deck has none). The pooled-allowance and
overage machinery from PR #17 remains in the codebase but is inert — every
plan's `conversationAllowance` is 0, which the usage surfaces read as "do not
meter". Reintroducing usage pricing would be a deliberate re-pricing decision,
not a default.

### Guided setup

The deck's Activation line is back as an arranged service: $149 per property,
one-time, white-glove onboarding. `GUIDED_SETUP_USD` in `lib/constants.ts` is
the code-side record of the amount; it is NOT charged in self-serve checkout
(the previous auto-charged activation fee was removed in 3519beb7 for exactly
that reason). Selling it means a deliberate checkout add-on, not a flag.

### Deferred, and why neither blocks launch

| Backlog item | State | Why it can wait |
|---|---|---|
| P3-05 trial-warning emails | Not built. `trigger/` still contains only `ping.test.ts`. | The trial is card-on-file with `end_behavior.missing_payment_method: 'cancel'`, so it converts on its own without any email being sent. Stripe also sends its own trial-ending notice when that setting is enabled on the account. A warning email improves the experience; its absence does not lose the customer or break billing. |
| P3-08 overage throttle ladder | Not built. No `lib/billing/throttle.ts`. | Conversations are unmetered on every plan — there is no overage to throttle. The per-conversation overage concept itself is retired; if usage pricing ever returns, throttling is part of that design, not this one's. |

**Owner: human (decision).** Whether to ship either before or after first
revenue. Both are additive and neither requires a migration.

### One behaviour worth knowing before you test

`past_due` is deliberately **not** treated as read-only. That status is Stripe's
dunning window, where the card is still being retried. Degrading service there
would punish a paying customer for a temporary card decline. Read-only starts at
`unpaid`, `canceled`, `incomplete_expired`, or `paused`.

Read-only means the AI concierge stops answering and the property cap drops to
1. Nothing is deleted, and guests still see the static portal, so a lapsed
account that pays again is immediately whole.
