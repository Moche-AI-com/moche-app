-- #195 PR 4: acknowledge alerts from every host-side action and schedule the
-- reminder ladder. Every trigger body traps its own errors so a bookkeeping
-- failure can never block a host reply, a page view or a new alert.

-- 1. Cancel pending steps whenever acknowledged_at is newly set, including when
--    another trigger sets it (UPDATE OF acknowledged_at would miss those).
drop trigger if exists notifications_ack_cancels_escalations on public.notifications;
create trigger notifications_ack_cancels_escalations
  after update on public.notifications
  for each row when (new.acknowledged_at is not null and old.acknowledged_at is null)
  execute function public.cancel_escalations_on_ack();

-- 2. Marking an alert read (bell / notifications page) counts as seeing it.
create or replace function public.ack_notification_on_read() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.read_at is not null and old.read_at is null and new.acknowledged_at is null then
    new.acknowledged_at := new.read_at;
  end if;
  return new;
end $$;

drop trigger if exists notifications_read_acknowledges on public.notifications;
create trigger notifications_read_acknowledges
  before update on public.notifications
  for each row when (new.read_at is not null and old.read_at is null)
  execute function public.ack_notification_on_read();

-- 3. Host opened the conversation (host_read_at advanced).
create or replace function public.ack_notifications_on_host_read() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.notifications
       set acknowledged_at = new.host_read_at
     where conversation_id = new.id
       and acknowledged_at is null
       and created_at <= new.host_read_at;
  exception when others then
    raise warning 'ack_notifications_on_host_read failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists conversations_host_read_acknowledges on public.conversations;
create trigger conversations_host_read_acknowledges
  after update of host_read_at on public.conversations
  for each row when (new.host_read_at is not null and new.host_read_at is distinct from old.host_read_at)
  execute function public.ack_notifications_on_host_read();

-- 4. Host replied in the conversation.
create or replace function public.ack_notifications_on_host_message() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.notifications
       set acknowledged_at = new.created_at
     where conversation_id = new.conversation_id
       and acknowledged_at is null
       and created_at <= new.created_at;
  exception when others then
    raise warning 'ack_notifications_on_host_message failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists messages_host_reply_acknowledges on public.messages;
create trigger messages_host_reply_acknowledges
  after insert on public.messages
  for each row when (new.role = 'host')
  execute function public.ack_notifications_on_host_message();

-- 5. Escalation answered, resolved or dismissed.
create or replace function public.ack_notifications_on_escalation() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  begin
    update public.notifications
       set acknowledged_at = now()
     where acknowledged_at is null
       and kind = 'escalation'
       and (link = '/dashboard/escalations/' || new.id::text
            or link like '/dashboard/escalations/' || new.id::text || '?%');
  exception when others then
    raise warning 'ack_notifications_on_escalation failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists escalations_handled_acknowledges on public.escalations;
create trigger escalations_handled_acknowledges
  after update on public.escalations
  for each row when (
    (new.status is distinct from old.status and new.status <> 'open')
    or (new.responded_at is not null and old.responded_at is null)
    or (new.resolved_at is not null and old.resolved_at is null)
  )
  execute function public.ack_notifications_on_escalation();

-- 6. Schedule the reminder ladder for alerts where a guest is waiting.
--    P2 (guest message / escalation): reminder text at 15 min, backup at 30.
--    P1 (emergency): repeat text at 5 min, backup at 10.
--    One P2 ladder per conversation at a time; P1 always gets its own.
create or replace function public.schedule_notification_escalations() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.acknowledged_at is not null then return null; end if;
    if new.urgency = 'p1' then
      insert into public.notification_escalations (notification_id, step, due_at) values
        (new.id, 'p1_repeat_5m', new.created_at + interval '5 minutes'),
        (new.id, 'p1_backup_10m', new.created_at + interval '10 minutes')
      on conflict (notification_id, step) do nothing;
      return null;
    end if;
    if not (new.kind in ('host_message', 'escalation') or new.urgency = 'p2') then return null; end if;
    if new.conversation_id is not null and exists (
      select 1
        from public.notification_escalations e
        join public.notifications n on n.id = e.notification_id
       where n.conversation_id = new.conversation_id
         and n.id <> new.id
         and e.status = 'pending'
    ) then
      return null;
    end if;
    insert into public.notification_escalations (notification_id, step, due_at) values
      (new.id, 'sms_15m', new.created_at + interval '15 minutes'),
      (new.id, 'backup_30m', new.created_at + interval '30 minutes')
    on conflict (notification_id, step) do nothing;
  exception when others then
    raise warning 'schedule_notification_escalations failed: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists notifications_schedule_escalations on public.notifications;
create trigger notifications_schedule_escalations
  after insert on public.notifications
  for each row execute function public.schedule_notification_escalations();

create index if not exists notifications_conversation_idx
  on public.notifications (conversation_id) where conversation_id is not null;

revoke all on function public.ack_notification_on_read() from public, anon, authenticated;
revoke all on function public.ack_notifications_on_host_read() from public, anon, authenticated;
revoke all on function public.ack_notifications_on_host_message() from public, anon, authenticated;
revoke all on function public.ack_notifications_on_escalation() from public, anon, authenticated;
revoke all on function public.schedule_notification_escalations() from public, anon, authenticated;
