-- =============================================================================
-- Host control over whether their own replies feed AI training
-- Applied: 2026-08-06 (Supabase migration `host_reply_ai_training_flag`)
-- =============================================================================
--
-- WHY
-- A host answering an escalation is frequently writing something situational —
-- "I'm ten minutes out", "use the spare key just this once", "ignore the sign,
-- that's for the other unit" — that would be actively wrong if the concierge
-- repeated it to the next guest. Until now every host reply was equally eligible
-- as context, which quietly turns a one-off courtesy into a standing policy.
--
-- This flag lets the host mark an individual reply as off-limits for training
-- from the dashboard, without deleting it: the guest keeps the message in their
-- thread, the host keeps the record, and only the AI stops learning from it.
--
-- DEFAULT
-- false (= usable). The common case genuinely is a reusable answer, and a
-- default of true would silently discard the single richest source of
-- property-specific truth the product has.
-- =============================================================================

alter table public.messages
  add column if not exists ai_training_excluded boolean not null default false;

comment on column public.messages.ai_training_excluded is
  'Host-set: when true this message must never be used as AI training/context material.';

-- Partial index: the only query that reads this column is "which host replies has
-- the host opted out?", and excluded rows are the rare case, so indexing just
-- those keeps the index small while still answering the question directly.
create index if not exists messages_ai_training_excluded_idx
  on public.messages (property_id)
  where ai_training_excluded = true;
