-- Apply through the reviewed migration pipeline, never directly to production.
create table public.review_nudge_stays (
  stay_id uuid primary key references public.stays(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  first_action text not null check (first_action in ('impression', 'response', 'dismiss', 'click')),
  created_at timestamptz not null default now()
);
create table public.review_nudge_responses (
  stay_id uuid not null references public.stays(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  guest_identity_id uuid not null references public.guest_identities(id) on delete cascade,
  feedback_id uuid not null unique references public.product_feedback(id) on delete cascade,
  helpfulness text check (helpfulness in ('yes', 'somewhat', 'not_yet')),
  updated_at timestamptz not null default now(),
  primary key (stay_id, guest_identity_id)
);
alter table public.review_nudge_stays enable row level security;
alter table public.review_nudge_responses enable row level security;
revoke all on public.review_nudge_stays, public.review_nudge_responses from public, anon, authenticated;
grant all on public.review_nudge_stays, public.review_nudge_responses to service_role;
create policy review_nudge_stays_service_only on public.review_nudge_stays for all to service_role using (true) with check (true);
create policy review_nudge_responses_service_only on public.review_nudge_responses for all to service_role using (true) with check (true);
comment on table public.review_nudge_stays is 'Server-only once-per-stay prompt suppression across the entire booking party. No browser grants.';
comment on table public.review_nudge_responses is 'Server-only private feedback identity/idempotency mapping. Comments remain in product_feedback; no guest or host direct read grants.';

create function public.guest_review_nudge_v2(p_session_id uuid, p_action text, p_automatic boolean default false, p_rating integer default null, p_helpfulness text default null, p_comment text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.guest_access_sessions%rowtype;
  s public.stays%rowtype;
  p public.properties%rowtype;
  cfg public.property_settings%rowtype;
  consumed boolean;
  ready boolean;
  fid uuid;
begin
  if current_user <> 'service_role' then raise insufficient_privilege using message = 'Server role required'; end if;
  if p_action is null or p_action not in ('status', 'impression', 'response', 'dismiss', 'click') then raise check_violation using message = 'Invalid action'; end if;
  select * into g from public.guest_access_sessions where id = p_session_id;
  if not found or g.status <> 'verified' or g.revoked_at is not null or g.expires_at <= now() or g.guest_identity_id is null or g.registered_at is null then
    raise insufficient_privilege using message = 'Invalid guest session';
  end if;
  if p_action = 'status' then
    select * into s from public.stays where id = g.stay_id;
  else
    select * into s from public.stays where id = g.stay_id for update;
  end if;
  if not found or s.property_id <> g.property_id or s.deleted_at is not null or s.status = 'revoked' or s.check_out + interval '12 hours' < now() then
    raise insufficient_privilege using message = 'Invalid stay';
  end if;
  if not exists (select 1 from public.guest_identities where id = g.guest_identity_id and property_id = s.property_id) then
    raise insufficient_privilege using message = 'Invalid guest identity scope';
  end if;
  select * into p from public.properties where id = s.property_id;
  if not found or p.status <> 'live' or p.deleted_at is not null then return jsonb_build_object('eligible', false); end if;
  select * into cfg from public.property_settings where property_id = s.property_id;
  if not found or not cfg.review_nudge_enabled then return jsonb_build_object('eligible', false); end if;
  consumed := exists (select 1 from public.review_nudge_stays where stay_id = s.id)
    or exists (select 1 from public.product_feedback f join public.guest_access_sessions gs on gs.id = f.guest_session_id
      where gs.stay_id = s.id and gs.property_id = s.property_id and f.property_id = s.property_id and f.source = 'guest'
      and f.page in ('guest_portal_review_nudge', 'guest_portal_review_nudge_dismiss', 'guest_portal_review_nudge_click'))
    or exists (select 1 from public.audit_logs a join public.guest_access_sessions gs on a.target_id = gs.id::text
      where gs.stay_id = s.id and gs.property_id = s.property_id and a.property_id = s.property_id and a.target_type = 'guest_session'
      and a.action in ('guest.review_nudge.response', 'guest.review_nudge.dismissed', 'guest.review_nudge.clicked'));
  -- Neutral completed-interaction timing: never gate review access on positive sentiment or score.
  ready := not consumed and cfg.review_nudge_auto and s.check_in <= now() and g.created_at + interval '30 seconds' <= now()
    and (exists (select 1 from public.conversations c join public.messages m on m.conversation_id = c.id and m.property_id = c.property_id
      where c.property_id = s.property_id and c.stay_id = s.id and c.guest_identity_id = g.guest_identity_id
      and c.channel = 'ai_concierge' and m.role = 'assistant' and m.guest_replay_safe)
      or exists (select 1 from public.extras_orders e where e.property_id = s.property_id and e.stay_id = s.id
        and e.guest_identity_id = g.guest_identity_id and e.fulfillment_status = 'fulfilled')
      or exists (select 1 from public.service_requests r where r.property_id = s.property_id and r.stay_id = s.id and r.status in ('resolved', 'closed')))
    and not exists (select 1 from public.escalations e where e.property_id = s.property_id and e.stay_id = s.id and e.status in ('open', 'answered'))
    and not exists (select 1 from public.service_requests r where r.property_id = s.property_id and r.stay_id = s.id and r.status in ('new', 'acknowledged', 'in_progress', 'waiting_on_guest'));
  if p_action = 'status' then return jsonb_build_object('eligible', true, 'automatic', cfg.review_nudge_auto, 'shouldPrompt', ready, 'reviewUrl', cfg.review_url); end if;
  if p_action = 'impression' and p_automatic and not ready then return jsonb_build_object('eligible', true, 'allowed', false); end if;
  if p_action = 'response' and (p_rating is null or p_rating < 1 or p_rating > 5 or length(coalesce(p_comment, '')) > 800
    or (p_helpfulness is not null and p_helpfulness not in ('yes', 'somewhat', 'not_yet'))) then
    raise check_violation using message = 'Invalid feedback';
  end if;
  if p_action = 'response' then
    select feedback_id into fid from public.review_nudge_responses where stay_id = s.id and guest_identity_id = g.guest_identity_id;
    if fid is null then
      insert into public.product_feedback(source, rating, comment, property_id, guest_session_id, page)
        values ('guest', p_rating, nullif(btrim(p_comment), ''), s.property_id, g.id, 'guest_portal_review_nudge_v2') returning id into fid;
      insert into public.review_nudge_responses(stay_id, property_id, guest_identity_id, feedback_id, helpfulness)
        values (s.id, s.property_id, g.guest_identity_id, fid, p_helpfulness);
    else
      update public.product_feedback set rating = p_rating, comment = nullif(btrim(p_comment), '') where id = fid and property_id = s.property_id and source = 'guest';
      if not found then raise check_violation using message = 'Feedback scope mismatch'; end if;
      update public.review_nudge_responses set helpfulness = p_helpfulness, updated_at = now() where stay_id = s.id and guest_identity_id = g.guest_identity_id;
    end if;
  end if;
  insert into public.review_nudge_stays(stay_id, property_id, first_action) values (s.id, s.property_id, p_action) on conflict (stay_id) do nothing;
  -- Feedback, suppression, and audit commit together. No free text enters telemetry.
  insert into public.audit_logs(host_account_id, property_id, actor_type, action, target_type, target_id, metadata)
    values (p.host_account_id, s.property_id, 'guest', 'guest.review_nudge.v2.' || p_action, 'guest_session', g.id::text,
      jsonb_build_object('automatic', p_automatic, 'rating', p_rating, 'helpfulness', p_helpfulness));
  return jsonb_build_object('eligible', true, 'ok', true, 'allowed', true);
end;
$$;
revoke all on function public.guest_review_nudge_v2(uuid, text, boolean, integer, text, text) from public, anon, authenticated;
grant execute on function public.guest_review_nudge_v2(uuid, text, boolean, integer, text, text) to service_role;
