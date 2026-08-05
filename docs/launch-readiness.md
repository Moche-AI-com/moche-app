# Launch readiness notes

Working notes for the pre-launch hardening pass. Each section records what was
checked, what the evidence was, and what a human still has to do. Anything under
"Owner: human" cannot be done from code or from an API token.

## Hosting / deploy state

**Checked:** `vercel projects ls` and `vercel ls` against the `moche-ai` team
scope, using the project's Vercel token.

**Result:** the team has **zero projects and zero deployments**. There is no
personal-scope alternative (Vercel rejects a personal account as a CLI scope for
this token). The application is therefore **not deployed anywhere on Vercel
today**.

Consequences worth being explicit about, because they are easy to get wrong:

- Merging to `main` does **not** publish anything. There is no Git integration to
  trigger, so `main` is the production *source of truth* but not a live site.
- The backlog tickets that ask us to "confirm the deployed branch" and "confirm
  Vercel project config" (P0-04, P0-05) have no subject to confirm. They are not
  done and not skipped; they are **not yet applicable**. They become real work at
  the moment a project is created.
- Environment variables have never been set in a Vercel project. Every secret in
  `.env.example` will need to be populated at project-creation time. The build
  will succeed without them (`lib/env.ts` reads everything lazily) and then fail
  at runtime, which is the worst failure shape. Populate them before sending
  traffic.

**Owner: human.** Creating the Vercel project, linking the GitHub repo, choosing
the production branch, and setting environment variables.

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
