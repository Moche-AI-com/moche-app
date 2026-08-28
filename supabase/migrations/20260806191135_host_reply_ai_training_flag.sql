-- Host control over whether their own replies feed AI training.
-- A host answering an escalation is often writing something situational ("I'm 10
-- minutes out", "use the spare key this once") that would be actively wrong if the
-- concierge repeated it to the next guest. Default false = usable for training,
-- because the common case is a genuine reusable answer; the host opts individual
-- messages OUT from the dashboard.
alter table public.messages
  add column if not exists ai_training_excluded boolean not null default false;

comment on column public.messages.ai_training_excluded is
  'Host-set: when true this message must never be used as AI training/context material.';

-- Partial index: the only query that reads this is "give me the host replies that
-- are still eligible for training", so indexing the excluded rows only keeps it tiny.
create index if not exists messages_ai_training_excluded_idx
  on public.messages (property_id)
  where ai_training_excluded = true;
