# Moche-AI Reports Rework — Execution Plan

**Prepared:** August 26, 2026
**Scope:** `/dashboard/reports` hub + per-topic spreadsheet-style report pages
**Status:** Decisions locked; ready for ticket breakdown and PR 1
**Inputs:** Verified against live repo `Moche-AI-com/moche-app` (Next 16.3.0) and live Supabase schema (project `sqpdzhannyskdiyuarhp`) on 2026-08-26. Builds on `planning/moche-ai-product-enhancement-plan-2026-08-05.md` (shared lifecycle pattern + Reports hub) and `infra/commercial-launch-readiness-2026-08-05.md`.

---

## 0. Decisions locked (2026-08-26)

| # | Question | Decision |
|---|---|---|
| 1 | Topic list | **Six topics in v1**, including Guest Directory |
| 2 | Stay reference | **Add `stays.stay_reference`** (human-quotable, mirrors `extras_orders.request_number` pattern) |
| 3 | Access | **Every authenticated member of the host account can view Reports.** No `can_view_analytics` gate on the section. Per-property data scoping still enforced by existing RLS / `property_members` |
| 4 | Export | **CSV download + print**, both respecting the current grid view |
| 5 | Stack | **Add `@tanstack/react-table` + `@dnd-kit/core` + `@dnd-kit/sortable`.** Verified absent from `package.json` today. Hand-rolling sort state + drag-drop is ~500 lines of subtle, accessibility-risky code; these two are the maintained standard pair and are styling-agnostic (fit the existing design system). AG Grid / MUI DataGrid rejected as too heavy / framework-locked |
| 6 | Phasing | **Three PRs** as proposed: (1) grid foundation + Stays + hub, (2) Escalations + Service Requests + Guest Directory, (3) Extras + Archived Properties + polish |

---

## 1. Current state (verified 2026-08-26)

- Single Reports page: `app/dashboard/reports/page.tsx` with `actions.ts`, `HandledEscalations.tsx`, `RestorePropertyButton.tsx`, and an existing printable detail page at `app/dashboard/reports/service-request/[id]/page.tsx`.
- Lifecycle model already in the DB: `stays`, `service_requests`, `extras_orders` have generated `lifecycle_status` (`archived` when completed/resolved/fulfilled). `escalations.lifecycle_status` is host-set; its column comment says archived rows are "listed under Reports."
- App is on **Next 16.3.0** (upgraded since the Aug 5 audit). No TanStack Table or dnd-kit installed. Icons via `lucide-react`.
- Archive volumes are tiny today (3 stays, 10 escalations, 3 service requests, 3 extras orders) — but design for 60-property hosts from the start.

## 2. Target architecture

### Routes

| Route | Content |
|---|---|
| `app/dashboard/reports/page.tsx` | Reworked hub: one card per topic with row count + most-recent activity, linking to topic pages |
| `app/dashboard/reports/stays/page.tsx` | Past Stays report |
| `app/dashboard/reports/escalations/page.tsx` | Handled Escalations report |
| `app/dashboard/reports/service-requests/page.tsx` | Service Requests report (index) |
| `app/dashboard/reports/service-requests/[id]/page.tsx` | Existing printable detail, **moved** from `service-request/[id]`; old route kept as a permanent redirect (hosts may have bookmarked/shared links) |
| `app/dashboard/reports/extras/page.tsx` | Extras & Upsells report |
| `app/dashboard/reports/properties/page.tsx` | Archived Properties report (reuses `RestorePropertyButton`) |
| `app/dashboard/reports/guests/page.tsx` | Guest Directory |

### Shared components & libs (all new)

| File | Responsibility |
|---|---|
| `components/reports/ReportGrid.tsx` | Client component. Generic grid: header click-sort (asc → desc → neutral), drag-drop column reorder (`@dnd-kit/sortable` on headers), per-column text filter inputs, column visibility toggle, empty state. Receives `ColumnDef[]` + rows. **All state in React memory only — nothing in localStorage, cookies, or URL params — so refresh always restores the default view** |
| `components/reports/ReportFilterBar.tsx` | Top-of-page server-side filters: Property dropdown ("All Properties" default), date-range picker, topic-specific selects (status, type, urgency, assignee). Changing these re-runs the server action |
| `components/reports/ReportToolbar.tsx` | Print button + CSV button + row count |
| `lib/reports/csv.ts` | Serialize the grid's **current view** (visible columns in current order, current sort + filters) to CSV with a UTF-8 BOM so Excel opens it cleanly; download via Blob |
| `lib/reports/format.ts` | Date formatting in the property's `timezone` (properties table has it), money from `quoted_amount_cents` + `quote_currency`, last4 phone rendering |
| `app/dashboard/reports/<topic>/columns.tsx` | Per-topic column definitions (key, label, sortable, filterable, default visibility, CSV label) |
| `app/dashboard/reports/<topic>/actions.ts` | Per-topic server action: auth check + RLS-scoped query pushing property/date filters into SQL, joins for names, row cap (500) with "load more" |

### Data flow

Server component page → server action fetches rows (RLS does account/property scoping) → passes plain row objects to client `ReportGrid` → sort/column-filter/reorder/visibility all client-side on the fetched set.

### Print behavior

`window.print()` + a `@media print` block that hides app chrome (nav, filter bar inputs, toolbar) and renders the grid as a clean full-width table **in its current state** (active column order/sort/filters). A `hidden print:block` header line shows topic name, active property/date filters, and generated-at timestamp so a printed report is self-describing. Generalizes the pattern already used by the `service-request/[id]` printable page.

### CSV behavior

Exports exactly what the user sees: visible columns, current order, current sort, current column filters. Filename: `moche-<topic>-<yyyy-mm-dd>.csv`.

## 3. Migration: `stays.stay_reference`

New human-quotable reference, generated in application code at stay creation (same pattern as `extras_orders.request_number`).

```sql
-- 1. Add column
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS stay_reference text;

-- 2. Backfill existing rows (6-char hex from uuid; app uses wider alphabet going forward)
UPDATE public.stays
SET stay_reference = 'STY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE stay_reference IS NULL;

-- 3. Constrain
ALTER TABLE public.stays ALTER COLUMN stay_reference SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stays_stay_reference_key ON public.stays (stay_reference);
```

- Format: `STY-` + 6 chars, uppercase alphanumeric minus ambiguous characters (no 0/O, 1/I/L), generated in app code with collision retry (same approach as the 4-digit visit-code generator).
- The 4-digit visit codes stay untouched — they remain HMAC-hashed secrets (`guest_access_links.code_hash`) and are never report data. `stay_reference` is the displayable, filterable identifier the user asked for.
- Surface `stay_reference` on the welcome card and stay screens too, so hosts and guests can quote it.
- **Applied to production on 2026-08-26** (migration `add_stay_reference`); file of record: `supabase/migrations/20260826_add_stay_reference.sql`.

## 4. Topic specifications

Every topic: default sort = most recent first; grid state resets on refresh; both print and CSV respect current view.

### 4.1 Past Stays (`/reports/stays`)

Source: `stays` ⟕ `stay_guests`, `guest_identities`, `properties`, `profiles`.

| Column | Source | Notes |
|---|---|---|
| Stay Ref | `stays.stay_reference` | New column (§3); column-searchable |
| Guest | `guest_display_name` / `guest_identities.first_name + last_name` | Column-searchable |
| Party | `guest_count` + `stay_guests.display_name` list | Renders "4 — Ana, Luis +2" |
| Property | `properties.display_name` | |
| Check-in / Check-out | `check_in`, `check_out` | Property timezone |
| Nights | derived | |
| Status | `status` | completed / revoked |
| Language | `guest_language` | |
| Created by | `created_by → profiles.full_name` | "who handled it" |
| Activity | derived counts: conversations, escalations, extras | |

Top filters: Property, date range on check-in, status. Column search: stay ref, guest name, party names.

### 4.2 Handled Escalations (`/reports/escalations`)

Source: `escalations` ⟕ `profiles`, `stays`, `properties`. Migrates existing `HandledEscalations.tsx` content into the grid.

Columns: Question (truncated), Guest, Stay Ref, Property, Status (`open/answered/resolved/dismissed`), Handled by (`responded_by → profiles.full_name`), Responded at, Resolved at, Time-to-resolve (derived), Created at.
Top filters: Property, date range on created-at, status, handled-by. Note: escalation archival is host-set (not generated), so rows reopened elsewhere simply leave this report — no special handling needed.

### 4.3 Service Requests (`/reports/service-requests`)

Source: `service_requests` ⟕ `profiles`, `property_contacts`, `stays`.

Columns: Request ID (short), Summary (`edited_summary` fallback `summary`), Type, Urgency, Status, Property, Guest/Stay Ref, Assigned teammate (`assigned_profile_id → profiles`), Assigned vendor (`assigned_contact_id → property_contacts.name`), Created, Closed at, Resolution notes.
Row click → existing printable detail (moved route). Top filters: Property, date range, status, type, urgency, assignee.

### 4.4 Extras & Upsells (`/reports/extras`)

Source: `extras_orders` ⟕ `guest_extras`, `stays`, `guest_identities`.

Columns: Request # (`request_number`), Item (`item_title`), Variant, Qty, Quoted amount, Status, Fulfillment status, Guest, Stay Ref, Property, Requested at, Scheduled for.
Top filters: Property, date range, status, fulfillment status.

### 4.5 Archived Properties (`/reports/properties`)

Source: `properties` where `status = 'archived'`.
Columns: Name, City/Region, Status, Archived at, Created at, Restore action (existing `RestorePropertyButton`).

### 4.6 Guest Directory (`/reports/guests`)

Source: `guest_identities` ⟕ `stays`, `stay_guests`, `properties`.

Columns: Name (`first_name`/`last_name` or `display_name`), Contact (`contact_type` + `contact_last4` — **last4 only; full phone is hash-only by design**), Property, Total stays (count via `stays.guest_identity_id`), Last checkout, First seen (`created_at`), Consented to notifications (via `stay_guests.notification_consent`).
Top filters: Property, date range on first-seen. Column search: name, last4.
Known limitation: `guest_identities` rows are per-property, so one human can appear once per property. Cross-property dedupe by `contact_hash` is a future enhancement, not v1.

## 5. Security & privacy checklist

- All queries through server actions with the existing auth helper pattern (`is_account_member()`-style guards); RLS already scopes rows by host account and property membership.
- Joins to `profiles` for handler names happen server-side only.
- Never render full guest phone numbers anywhere in reports (hash + last4 is all the DB holds — keep it that way).
- No report data in URL params (also enforces the reset-on-refresh requirement).
- Sentry: wrap topic pages in the app's existing error boundary pattern so a bad grid state can't white-screen the dashboard.

## 6. PR breakdown

### PR 1 — Foundation + Past Stays (tracked in issue #81)

1. Migration: `stays.stay_reference` (column, backfill, unique index) + app-side generation at stay creation + surface on welcome card. **Migration applied to production 2026-08-26.**
2. `npm i @tanstack/react-table @dnd-kit/core @dnd-kit/sortable`.
3. `ReportGrid`, `ReportFilterBar`, `ReportToolbar`, `lib/reports/csv.ts`, `lib/reports/format.ts`, print stylesheet.
4. Hub rework (`reports/page.tsx`): six topic cards with counts + latest-activity via one `getReportsOverview()` server action.
5. Stays topic page end-to-end.

**Acceptance:** hub shows six cards with correct counts; Stays grid sorts on every column header click, reorders via header drag, filters by stay ref/guest/party text, property + date filters re-query; print and CSV match on-screen view; refresh restores default view; no new Sentry errors in preview.

### PR 2 — Escalations + Service Requests + Guest Directory (tracked in issue #82)

1. Escalations topic page (absorb `HandledEscalations.tsx`, delete the old component).
2. Service Requests index page; move `service-request/[id]` → `service-requests/[id]` with a permanent redirect from the old path.
3. Guest Directory topic page.

**Acceptance:** old service-request URLs redirect; escalation rows show handler + time-to-resolve; guest directory renders last4-only contact info; all three grids inherit sort/drag/CSV/print with zero per-topic grid code.

### PR 3 — Extras + Archived Properties + Polish (tracked in issue #83)

1. Extras topic page (money formatting via `quote_currency`).
2. Archived Properties page with restore action.
3. Print polish pass (column widths, page breaks, header block) across all six.
4. Load-more behavior verified at 500+ rows (seed a preview DB to prove it).

**Acceptance:** all six topics live; printed output clean on letter + A4; no console errors; hub counts match topic row counts.

## 7. Edge cases to test

- Empty states per topic (brand-new account with no archived rows).
- A stay with no `stay_guests` rows (party of 1, no named companions).
- Guest names in non-Latin scripts — CSV must carry the UTF-8 BOM; print must not clip.
- Revoked stays vs completed stays (both archived; status column distinguishes).
- Property member with access to a subset of properties: hub counts and every topic must only reflect their properties (RLS does this; verify with a restricted test account).
- 500+ row fetch cap: sort/filter apply to loaded rows; the toolbar shows "showing 500 of N" so users aren't misled.
