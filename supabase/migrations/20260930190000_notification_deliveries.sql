-- #195 PR 3: per-attempt delivery tracking, acknowledgement, grouping, escalation queue.
-- Additive only. Tables are server-only (RLS on, no policies); the app reads/writes via the service role.

alter table public.notifications
  add column if not exists urgency text check (urgency in ('p1','p2','p3','p4')),
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
  add column if not exists collapse_count integer not null default 1 check (collapse_count >= 1);

create index if not exists notifications_recipient_conversation_open_idx
  on public.notifications (recipient_profile_id, conversation_id, created_at desc)
  where acknowledged_at is null and conversation_id is not null;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('in_app','push','sms','email','voice')),
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','failed','suppressed','skipped')),
  reason text,
  provider_ref text,
  attempt integer not null default 1 check (attempt >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);
create unique index if not exists notification_deliveries_provider_ref_idx
  on public.notification_deliveries (provider_ref) where provider_ref is not null;
create index if not exists notification_deliveries_recipient_sms_recent_idx
  on public.notification_deliveries (recipient_profile_id, created_at desc)
  where channel = 'sms' and status in ('queued','sent','delivered');

alter table public.notification_deliveries enable row level security;

create table if not exists public.notification_escalations (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  step text not null check (step in ('sms_5m','sms_15m','backup_30m','p1_repeat_5m','p1_backup_10m','p1_voice_15m')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, step)
);

create index if not exists notification_escalations_due_idx
  on public.notification_escalations (due_at) where status = 'pending';

alter table public.notification_escalations enable row level security;

create or replace function public.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists notification_deliveries_touch on public.notification_deliveries;
create trigger notification_deliveries_touch before update on public.notification_deliveries
  for each row execute function public.touch_updated_at();

drop trigger if exists notification_escalations_touch on public.notification_escalations;
create trigger notification_escalations_touch before update on public.notification_escalations
  for each row execute function public.touch_updated_at();

-- Acknowledging a notification cancels its pending escalation steps.
create or replace function public.cancel_escalations_on_ack() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.acknowledged_at is not null and old.acknowledged_at is null then
    update public.notification_escalations
       set status = 'cancelled'
     where notification_id = new.id and status = 'pending';
  end if;
  return new;
end $$;

revoke all on function public.cancel_escalations_on_ack() from public, anon, authenticated;

drop trigger if exists notifications_ack_cancels_escalations on public.notifications;
create trigger notifications_ack_cancels_escalations after update of acknowledged_at on public.notifications
  for each row execute function public.cancel_escalations_on_ack();
