-- Appliance guidance is property- and device-scoped. Catalog and AI content stays
-- draft until a host approves it; guests only see approved, visible content
-- through authenticated server routes, never direct table access.

alter table public.property_appliances
  add column if not exists guest_visible boolean not null default true,
  add column if not exists guest_guidance text,
  add column if not exists private_notes text,
  add column if not exists guidance_approved_at timestamptz,
  add column if not exists guidance_approved_by uuid references public.profiles(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'property_appliances_guidance_length') then
    alter table public.property_appliances add constraint property_appliances_guidance_length
      check (guest_guidance is null or length(guest_guidance) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'property_appliances_private_notes_length') then
    alter table public.property_appliances add constraint property_appliances_private_notes_length
      check (private_notes is null or length(private_notes) <= 4000);
  end if;
end $$;

-- A composite key prevents accidentally attaching answers to an appliance in
-- another property even in service-role code. Keep existing inventory IDs intact.
create unique index if not exists property_appliances_property_id_id_uidx
  on public.property_appliances (property_id, id);

create table if not exists public.appliance_answers (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null,
  appliance_id uuid not null,
  question text not null check (length(btrim(question)) between 1 and 300),
  answer text not null check (length(btrim(answer)) between 1 and 4000),
  source_kind text not null check (source_kind in ('host', 'manual', 'catalog', 'ai_draft')),
  source_ref text check (source_ref is null or length(source_ref) <= 2000),
  model_number_snapshot text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'hidden')),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appliance_answers_property_appliance_fkey
    foreign key (property_id, appliance_id)
    references public.property_appliances (property_id, id) on delete cascade,
  constraint appliance_answers_approval_consistency
    check (status <> 'approved' or approved_at is not null)
);

create index if not exists appliance_answers_property_appliance_idx
  on public.appliance_answers (property_id, appliance_id, status);
create unique index if not exists appliance_answers_approved_question_uidx
  on public.appliance_answers (appliance_id, lower(btrim(question)))
  where status = 'approved';

alter table public.appliance_answers enable row level security;
revoke all on public.appliance_answers from anon;
grant select, insert, update on public.appliance_answers to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'appliance_answers' and policyname = 'appliance_answers_select_members') then
    create policy appliance_answers_select_members on public.appliance_answers
      for select to authenticated using (public.can_access_property(property_id));
    create policy appliance_answers_insert_editors on public.appliance_answers
      for insert to authenticated with check (public.can_edit_property(property_id));
    create policy appliance_answers_update_editors on public.appliance_answers
      for update to authenticated using (public.can_edit_property(property_id))
      with check (public.can_edit_property(property_id));
  end if;
end $$;

-- Never let an edit to approved text or a model change silently retain approval.
create or replace function public.appliance_guidance_revoke_on_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.guest_guidance is distinct from old.guest_guidance
     or new.model_number is distinct from old.model_number then
    new.guidance_approved_at := null;
    new.guidance_approved_by := null;
  end if;
  return new;
end $$;

drop trigger if exists appliance_guidance_revoke_on_edit on public.property_appliances;
create trigger appliance_guidance_revoke_on_edit
  before update on public.property_appliances for each row
  execute function public.appliance_guidance_revoke_on_edit();

create or replace function public.appliance_answer_revoke_on_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.question is distinct from old.question
     or new.answer is distinct from old.answer
     or new.source_kind is distinct from old.source_kind
     or new.source_ref is distinct from old.source_ref
     or new.model_number_snapshot is distinct from old.model_number_snapshot then
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end $$;

drop trigger if exists appliance_answer_revoke_on_edit on public.appliance_answers;
create trigger appliance_answer_revoke_on_edit
  before update on public.appliance_answers for each row
  execute function public.appliance_answer_revoke_on_edit();

-- Approved model-derived answers stop serving if the property's model changes.
create or replace function public.appliance_answers_revoke_on_model_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.model_number is distinct from old.model_number then
    update public.appliance_answers set status = 'draft', approved_at = null,
      approved_by = null, updated_at = now()
    where property_id = new.property_id and appliance_id = new.id
      and model_number_snapshot is not null;
  end if;
  return new;
end $$;

drop trigger if exists appliance_answers_revoke_on_model_change on public.property_appliances;
create trigger appliance_answers_revoke_on_model_change
  after update of model_number on public.property_appliances for each row
  execute function public.appliance_answers_revoke_on_model_change();

revoke execute on function public.appliance_guidance_revoke_on_edit() from public, anon, authenticated;
revoke execute on function public.appliance_answer_revoke_on_edit() from public, anon, authenticated;
revoke execute on function public.appliance_answers_revoke_on_model_change() from public, anon, authenticated;
