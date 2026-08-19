-- ============================================================================
-- Concierge answer-cache purge — remediation for the credential-leak defect.
--
-- WHY THIS EXISTS
-- ---------------
-- `lib/ai/redaction.ts` rewrote `<label> <next-token>` as `<label>: [redacted]`,
-- which consumed the FILLER WORD rather than the value. A host sentence like
--   "The WiFi network name is CapeHouse-Guest and the password is <secret>"
-- was rewritten to
--   "The WiFi: [redacted] network name is CapeHouse-Guest and the password: [redacted] is <secret>"
-- i.e. a redaction marker printed immediately next to a fully intact credential,
-- with the surrounding prose destroyed.
--
-- That string was then persisted in two durable places:
--   1. `answer_cache` — replayed VERBATIM to every later guest asking the same
--      normalized question, with no model call and therefore no chance for the
--      fixed guard to run over freshly retrieved context.
--   2. `messages`     — read back as conversation history on every later turn.
--
-- Separately, the guest-chat route loaded history with
-- `.order('created_at', { ascending: true }).limit(12)`, returning the OLDEST 12
-- rows instead of the newest. That froze the "recent history" window on the
-- opening turns of a stay, so the concierge restated the Wi-Fi answer on top of
-- every unrelated reply — and those polluted replies were cached too.
--
-- The code defects are fixed in this PR (see lib/ai/redaction.ts,
-- lib/brain/redact.ts, app/api/guest/[slug]/chat/route.ts). The fixed
-- `redactCredentials` now also REPAIRS the mangled shape on cache read, so the
-- leak is contained even before this migration runs. This migration removes the
-- poisoned rows outright so no guest is served a stale, off-topic, or
-- credential-adjacent answer at all.
--
-- SCOPE / SAFETY
-- --------------
--   * Data-only. No DDL. No table, column, policy, function, or grant is
--     created, altered, or dropped, so no new RLS policy or negative test is in
--     scope (AGENTS.md boundary 8).
--   * `answer_cache` is a DERIVED cache, not a source of truth. Deleting a row
--     costs one extra model call on the next identical question and nothing else.
--     It is explicitly designed to be dropped: `bumpBrainVersion()` in
--     lib/brain/cache.ts already deletes a property's rows wholesale.
--   * It does NOT touch `brain_items`, `document_chunks`, `brain_values`, or
--     `property_knowledge_nodes`. Guest-facing Brain content is only ever changed
--     through a `proposed_update` with human approval (AGENTS.md boundary 4).
--   * It does NOT delete from `messages`. Those rows are the guest/host
--     transcript and part of the support record; the read-path redaction now
--     sanitizes them. Purging transcript history is an owner decision, not a
--     side effect of a bug fix.
--   * Idempotent and safe to run repeatedly.
--   * Applied ONLY through the GitHub Actions pipeline after PR review.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Report what will be removed, so the pipeline log records the blast radius
--    WITHOUT ever printing a credential (AGENTS.md boundary 5: no access codes
--    in logs or telemetry). Counts and property ids only — never `answer`.
-- ---------------------------------------------------------------------------
do $$
declare
  v_marker_rows   bigint;
  v_secret_rows   bigint;
  v_properties    bigint;
begin
  select count(*) into v_marker_rows
    from public.answer_cache
    where answer like '%[redacted]%'
       or answer like '%[stored securely%';

  -- Rows whose answer leads with Wi-Fi/network content while the cached question
  -- was about something else entirely: the history-window pollution.
  select count(*) into v_secret_rows
    from public.answer_cache
    where question_norm !~* '(wi-?\s?fi|wireless|internet|network|ssid|password|hotspot)'
      and answer ~* '^\s*(the\s+)?(wi-?\s?fi|wireless|network)\b';

  select count(distinct property_id) into v_properties
    from public.answer_cache
    where answer like '%[redacted]%'
       or answer like '%[stored securely%'
       or (question_norm !~* '(wi-?\s?fi|wireless|internet|network|ssid|password|hotspot)'
           and answer ~* '^\s*(the\s+)?(wi-?\s?fi|wireless|network)\b');

  raise notice 'answer_cache purge: % marker-bearing row(s), % off-topic row(s), across % property(ies)',
    v_marker_rows, v_secret_rows, v_properties;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Any cached answer containing a redaction marker was produced by the broken
--    guard. Even where no credential survived, the prose was mangled ("The WiFi:
--    [redacted] network name is ...") and is not something to serve a guest.
-- ---------------------------------------------------------------------------
delete from public.answer_cache
where answer like '%[redacted]%'
   or answer like '%[stored securely%';

-- ---------------------------------------------------------------------------
-- 3. Answers polluted by the stale-history window: the cached question is not
--    about connectivity, yet the answer OPENS with Wi-Fi/network content. This is
--    the "it spits the Wi-Fi answer out on top of everything" symptom, frozen
--    into cache rows that would otherwise be replayed forever.
-- ---------------------------------------------------------------------------
delete from public.answer_cache
where question_norm !~* '(wi-?\s?fi|wireless|internet|network|ssid|password|hotspot)'
  and answer ~* '^\s*(the\s+)?(wi-?\s?fi|wireless|network)\b';

-- ---------------------------------------------------------------------------
-- 4. Belt and braces: bump the Brain version for every property that still has
--    cache rows referencing connectivity. `lookupCachedAnswer` compares
--    brain_version and returns NULL on a mismatch, so this logically invalidates
--    anything the two DELETEs above did not pattern-match. Uses the existing
--    RPC so the version sequence stays consistent with the application path.
--
--    Guarded on the function existing so this migration is safe to run against a
--    branch database created before supabase-migrations-CONCIERGE.sql.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bump_brain_version'
  ) then
    raise notice 'bump_brain_version() not present; skipping version bump';
    return;
  end if;

  for r in
    select distinct property_id
    from public.answer_cache
    where question_norm ~* '(wi-?\s?fi|wireless|internet|network|ssid|password|code)'
  loop
    perform public.bump_brain_version(r.property_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Verification: no marker-bearing rows may remain. Fails the migration (and
--    therefore the pipeline) rather than reporting success on a partial purge.
-- ---------------------------------------------------------------------------
do $$
declare
  v_remaining bigint;
begin
  select count(*) into v_remaining
    from public.answer_cache
    where answer like '%[redacted]%'
       or answer like '%[stored securely%';

  if v_remaining > 0 then
    raise exception 'answer_cache still holds % row(s) with a redaction marker', v_remaining;
  end if;

  raise notice 'answer_cache purge verified: 0 marker-bearing rows remain';
end $$;

commit;
