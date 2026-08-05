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

### Still open

Two projects deploying the same repo is ambiguous. Which one owns
`www.moche-ai.com`, and whether the other is a leftover, needs a decision. Two
live projects on one repo means two sets of env vars drifting apart, and
`push_env_to_aqbb.sh` existing at all suggests that drift has already been felt.

**Owner: human.** Confirming which project is production, retiring or clearly
labelling the other, and confirming the production branch and env vars on the
survivor. `lib/env.ts` reads every secret lazily, so a missing var produces a
successful build and a runtime failure, which is the worst failure shape.

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
| `authenticated_security_definer_function_executable` | 6 | Five self-scoped boolean helpers (`can_access_property`, `can_edit_property`, `is_account_member`, `is_account_owner`, `is_admin`). Each answers only "may *the calling user* do X", so a signed-in caller learns nothing they could not learn from their own row access. They are referenced by many tracked migration files; relocating them to the `private` schema is a follow-up with real blast radius, not a launch blocker. |
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

**Owner: human.** If a one-time activation-fee Price object exists in the Stripe
dashboard, archive it. Nothing in code references it now, so it cannot be
charged, but leaving a stray price object invites confusion later.
