# Directive Amendment 001 — Binding

Amends **Moche-AI Unified Build Directive (Merged Execution Contract)**.

Three items in the directive were unimplementable as written. This amendment closes all
three with concrete, machine-checkable definitions. Where this document and the directive
disagree, this document governs.

---

## A. The `~65%` onboarding completeness denominator (closes §5)

The directive says "ship a property at roughly 65% completeness" and separately says
Firecrawl import output must be described as a "30–50% bootstrap". Neither number was
computable: no denominator was defined, so 65% could mean 65% of all registry fields, 65%
of fields applicable to that property, or 65% of a weighted score — three different numbers
for the same property.

### A.1 Definition

`completeness_pct` is computed **only** by `computeCompleteness()` in
`lib/brain/completeness.ts`. No surface may calculate a percentage independently.

```
completeness_pct = 100 × Σ(credit(status) × gap_weight) / Σ(gap_weight)
```

both sums taken over the **scored set** defined in A.2.

### A.2 The scored set (the denominator)

A `field_registry` entry is in the scored set for a given property when **all** of:

1. `gap_weight > 0`. Fields with `gap_weight = 0` are tracked but never scored.
2. `system_section = false`. The four hidden system sections (Provenance/Audit,
   Automations/Rules, Sources/Scrape Log, Safety/Escalations) never contribute to a
   host-facing percentage.
3. The field's `applicability` predicate resolves true for that property. A field whose
   predicate resolves false (pool instructions on a property with no pool) is **removed
   from the denominator entirely** — it is not credited as satisfied.

`not_applicable` status has the same effect: **removed from the denominator, not credited
as 1**. Crediting inapplicable fields as satisfied inflates the score and is the specific
bug this clause exists to prevent. (The pre-amendment `computeReadiness()` engine credited
`not_applicable` as 1.0; that behavior is superseded.)

### A.3 Credit table

| status | credit |
|---|---|
| `satisfied` | 1.0 |
| `partial` | 0.5 |
| `missing` | 0.0 |
| `not_applicable` | — (removed from denominator per A.2) |

A field is `partial` when its value is present but its **required** companion
`on_failure_field` is empty. An operational/access field with a value and no fallback
procedure is deliberately never scored as fully satisfied (§3 `on_failure_field`).

### A.4 The 65% figure

`COMPLETENESS_SHIP_THRESHOLD = 65` — a property may be published at
`completeness_pct >= 65`.

This threshold is **necessary but not sufficient**. Publication additionally requires all
six hard-block fields at `satisfied` (§5.3): `parking`, `door_code_or_entry_method`,
`wifi_password`, `checkout_time`, `nearest_grocery`, `maintenance_emergency_contact`.
Score never substitutes for the hard blocks, and the hard blocks never substitute for the
score. Both clear independently.

### A.5 The 30–50% bootstrap figure

The "30–50% bootstrap" ceiling for import output is measured on **this same denominator**,
so the two numbers are directly comparable and a host can read "import got you to 38%, you
need 65%" as one continuous scale. Any host-facing copy quoting a bootstrap percentage must
source it from `computeCompleteness()`, not from a count of extracted fields.

### A.6 Autopilot is unaffected

`completeness_pct` never gates autopilot on its own (§10). The golden evaluation suite
(§7.0) plus the six hard-block fields gate autopilot. A property at 100% completeness with
a failing eval suite does not unlock.

---

## B. The `audience` enum (closes §0, §3.2, §6)

The directive placed `audience` on the `brain_values` envelope and required an "audience
check" during fact rendering, but never enumerated it. `sensitivity_tier` was fully
specified, which made `audience` look redundant and invited agents to either drop it or
overload it with sensitivity semantics.

### B.1 The two axes are orthogonal and both required

- `sensitivity_tier` answers **"how protected is this value?"** — it determines storage
  routing (Vault or not), whether the value may be embedded, and write-gate strictness.
  It is a property of the *value*.
- `audience` answers **"which surface may this value be rendered on?"** — it determines
  which delivery channel and which reader class may receive it. It is a property of the
  *delivery*.

Neither may stand in for the other, matching §0's stacked-authorization resolution.

### B.2 `audience_tier` enum — canonical values

| value | reader | precondition |
|---|---|---|
| `system_internal` | no human surface | audit/provenance only; never rendered |
| `host_private` | host + account owner | dashboard session only |
| `staff_ops` | host, members, cleaners, maintenance | `property_members` row |
| `guest_public` | anyone holding the property guest link | no reservation required |
| `guest_prearrival` | guest with a confirmed reservation | reservation confirmed, before check-in |
| `guest_instay` | guest inside the stay window | `access_window_ok = true`, server-derived |

Ordered least-to-most exposed: `system_internal` < `host_private` < `staff_ops` <
`guest_instay` < `guest_prearrival` < `guest_public`. (`guest_instay` is *less* exposed
than `guest_prearrival` because it is additionally time-bounded.)

### B.3 Compatibility matrix — enforced as a DB CHECK constraint, not documentation

A `brain_values` row whose `(sensitivity_tier, audience)` pair is absent from this matrix
is rejected at write time by `brain_values_audience_matrix_chk`. This is what makes the
enum implementable rather than decorative.

| `sensitivity_tier` | permitted `audience` |
|---|---|
| `public_guest` | `guest_public`, `guest_prearrival`, `guest_instay`, `staff_ops`, `host_private` |
| `guest_after_verification` | `guest_prearrival`, `guest_instay`, `staff_ops`, `host_private` |
| `stay_scoped_secret` | `guest_instay`, `staff_ops`, `host_private` |
| `host_only` | `host_private`, `staff_ops`, `system_internal` |

Consequences that follow mechanically from the matrix:

- A `stay_scoped_secret` fact can never carry `guest_public` or `guest_prearrival`, so a
  door code cannot be addressed to a pre-arrival surface even by mistake.
- `system_internal` pairs only with `host_only`, so no system/audit row can ever be
  addressed to a guest surface.
- `host_only` permits `staff_ops` because staff are inside the org boundary
  (`property_members` only), but permits **no** guest audience at all — which is the tier's
  entire purpose. Utility shutoff locations reach a cleaner; they never reach a guest.
- `guest_public` requires `public_guest`, so the public guest link can only ever render
  tier-1 facts.

### B.4 Rendering rule

A fact renders only when **all four** independent checks pass, in this order, all
server-derived (§6):

1. `authorized` — `org_id`/`property_id` derived from the session, never from a
   caller-supplied ID.
2. `audience_ok` — the requesting surface's audience is permitted for the row's
   `audience` value (a surface may render its own audience and any *less* exposed one it
   is entitled to; it may never render a more exposed one).
3. `sensitivity_ok` — the row's tier is renderable on this channel, and Vault-backed
   values resolve through the deterministic placeholder renderer only.
4. `access_window_ok` — computed from reservation/stay state and current time for any
   `guest_instay` row.

A failure at any step returns `needs_host` or a clarification route. It never falls through
to retrieval or generation to guess (§6, §9.0a).

### B.5 Default

`audience` is populated from `field_registry.default_audience` at write time and is never
chosen ad hoc by an agent, mirroring the §0 rule for `sensitivity_tier`. Registry entries
declare the most restrictive audience that still lets the field do its job.

---

## C. "Week N" → "Gate N" (closes §2, §10)

Time is not authorization. Every "Week N" heading in the directive is renamed to a gate
with an evidence-based exit condition. A gate opens when its evidence exists, whether that
takes two days or two months; elapsed time alone never opens one.

| Was | Now | Exit condition (evidence required) |
|---|---|---|
| Week 1 — contract/legal groundwork | **Gate 0 — Contract ratified** | Every §0.4 row is DECIDED or DEFERRED-with-enforced-safe-default; this amendment merged |
| Week 1–2 — Wave 0 isolation repair | **Gate 1 — Isolation proven** | §14 definition-of-done checklist complete, including independent-verifier reconfirmation (§0.6) |
| Week 2 — registry PR | **Gate 2 — Registry pinned** | `field_registry.json` v1 + materialized table + drift CI merged; SHA pinned only after Gate 1 evidence reviewed in full |
| Week 2–3 — two agents in parallel | **Gate 3 — Contract layer live** | Both tracks merged sequentially from the Gate 2 SHA, each with captured output evidence; Vault work independently verified |
| Week 3 onward — sequential phases | **Gates 4–8** | Each phase's own deliverables live, in the directive's stated order |

### C.1 The one place time was load-bearing — replaced

§10 required "suggest-mode only, for a minimum of the first two weeks." That is a
time-as-authorization clause, and it is replaced by **Gate 8**, which is evidential:

> The suggest-mode floor may be lifted for a category only when, for that category:
> golden evaluation suite (§7.0) passing at its per-category threshold; **and** at least
> 200 host-reviewed AI drafts have been sent across at least 5 distinct properties;
> **and** median host-edit distance on those drafts is at or below the per-category
> threshold set under §0.4 item 4; **and** zero unresolved cross-property access
> attempts, validator failures, or RLS failures in the trailing evidence window.

A calendar date never opens Gate 8. Two weeks with no drafts reviewed produces no evidence
and therefore no unlock, which is the intended behavior and the reason for the change.

### C.2 Unchanged by this rename

Gate ordering, the single-writer ownership table, the serialized-registry rule (§0.2a),
the independent-verifier requirement (§0.6), and the §13 stop-and-ask conditions all carry
over unmodified. Renaming the gates removes an ambiguity about *authorization*; it does not
relax any *sequencing* constraint.

---

## D. Amendment status

| Item | Status |
|---|---|
| A — completeness denominator | DECIDED, implemented in `lib/brain/completeness.ts` |
| B — audience enum + matrix | DECIDED, implemented as `audience_tier` enum + CHECK constraint |
| C — Gate renaming | DECIDED, no code impact beyond documentation |

Appended to the §0.5 decision log.

---

## E. Carried debt (recorded, not resolved)

These items were discovered while repairing `main` and are **not** fixed by this
branch. They are listed here so nothing is hidden behind a green CI badge.

| # | Item | Where | Why deferred |
|---|---|---|---|
| E1 | 31 React Compiler findings from `eslint-plugin-react-hooks` 7 (21 `set-state-in-effect`, 8 `refs`, 2 `purity`) are set to `warn`, not `error` | `eslint.config.mjs` | These rules did not exist under the previous toolchain. All 31 findings predate this branch. Setting them to `error` would couple a toolchain repair to a 31-site hydration refactor across the dashboard. They remain visible in every CI run. Reducing to zero should restore `error`. |
| E2 | `lib/brain/readiness.ts` credits `not_applicable` as `1.0`, which inflates host-visible completeness | `lib/brain/readiness.ts` | Deliberately untouched. `lib/brain/completeness.ts` implements the Amendment A denominator correctly and independently. Fixing `readiness.ts` in this branch would silently move numbers hosts have already seen, with no migration or messaging. Needs an owner decision on how to communicate the correction. |
| E3 | `test:e2e` in `package.json` runs `playwright test` but no Playwright config or spec directory exists | `package.json` | Dead script. The runtime verification for this branch was therefore a manual smoke test of the changed dynamic-param and cookie paths against `next start`, not an e2e run. Recorded so the gap is not mistaken for coverage. |
| E4 | `tsconfig.json` was rewritten by the Next 16 build (`jsx: preserve` -> `react-jsx`, `.next/dev/types` added, whitespace reflowed) | `tsconfig.json` | Next writes this file itself on every build; reverting it produces a dirty tree on the next run. Change is Next-authored, not hand-authored. |
| E5 | `SUPABASE_SERVICE_ROLE_KEY` is inlined at build time, so a placeholder-env build cannot serve guest routes | build config | Surfaced during smoke testing: `/stay/[slug]` and `/g/[slug]` return 500 under a placeholder build. Not a defect in this branch, but it means those two routes cannot be smoke-tested without real secrets. |
