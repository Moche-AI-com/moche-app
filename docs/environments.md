# environments.md

Environment **identifiers only**. No secrets, keys, tokens, connection strings, or passwords
of any kind belong in this file — ever. If a value would grant access on its own, it does not
go here.

Owner-provisioned per Execution Directive v3, Tier 1. Agents may append non-secret discovery
findings.

Last updated: 2026-08-11

## Domains

| Purpose | Value |
|---|---|
| Production site | `www.moche-ai.com` |

## Supabase

| Field | Production | Staging |
|---|---|---|
| Organization name | `Moche.Ai` | (same org, TBD) |
| Organization ID | `ejqcoqlcvtrkierqdpkq` | TBD |
| Project name | `moche-ai-app` | Not yet provisioned |
| Project ref | `sqpdzhannyskdiyuarhp` | TBD |
| Region | `us-east-1` | TBD |
| Postgres version | `17.6.1.147` (engine 17, `ga`) | TBD |
| Status | `ACTIVE_HEALTHY` | — |
| Plan | `free` | — |

Staging is a Tier 2 prerequisite (required before Tickets P0-2 through P0-4 begin). Its
project ref is recorded here once provisioned.

## Vercel

| Field | Value |
|---|---|
| Team / scope | `moche-ai` |
| Production project | `moche-app` |
| Retired duplicate project | `moche-app-aqbb` — Git disconnected 2026-08-11, project intentionally not deleted |
| Production domain | `www.moche-ai.com` |
| Node version | `24.x` |

## Sentry

| Field | Value |
|---|---|
| Organization slug | `moche-ai` |
| Organization URL | `https://moche-ai.sentry.io` |
| Region URL | `https://us.sentry.io` |
| Project slug | `javascript-nextjs` |

## Source Control

| Field | Value |
|---|---|
| Repository | `Moche-AI-com/moche-app` |
| Default branch | `main` |
| CI workflow | `.github/workflows/ci.yml` |
| Existing CI job IDs | `lint`, `typecheck`, `test`, `build` |

## Plan Status

Directive Tier 1 calls for Vercel Pro, Supabase Pro, and Sentry Team. As of 2026-08-11 the
Supabase organization is on the `free` plan; the upgrade has been deliberately deferred by the
owner until there is production user load. Recorded here as a known open Tier 1 item, not as a
pass.

## Notes

- Migrations are applied through GitHub Actions only — never from a local machine and never
  directly by an agent (AGENTS.md, Boundary 1).
- Guest-shaped data is inspected against the staging seed, never against production.
