-- Recorded in production as appliance_approval_write_guard.
-- Signed-in property editors may create drafts, but cannot self-approve
-- by writing directly to the exposed Supabase tables. Trusted server actions
-- must validate permissions and safety, then perform approval as service_role.
create or replace function public.appliance_guard_guidance_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.guidance_approved_at is not null or new.guidance_approved_by is not null then
        raise exception 'appliance guidance approval requires trusted server';
      end if;
    elsif new.guidance_approved_at is distinct from old.guidance_approved_at
       or new.guidance_approved_by is distinct from old.guidance_approved_by then
      if new.guidance_approved_at is not null or new.guidance_approved_by is not null then
        raise exception 'appliance guidance approval requires trusted server';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists appliance_guard_guidance_approval on public.property_appliances;
create trigger appliance_guard_guidance_approval before insert or update
on public.property_appliances for each row
execute function public.appliance_guard_guidance_approval();

create or replace function public.appliance_guard_answer_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if new.status = 'approved' or new.approved_at is not null or new.approved_by is not null then
        raise exception 'appliance answer approval requires trusted server';
      end if;
    elsif (new.status = 'approved' and old.status is distinct from 'approved')
       or (new.approved_at is distinct from old.approved_at and new.approved_at is not null)
       or (new.approved_by is distinct from old.approved_by and new.approved_by is not null) then
      raise exception 'appliance answer approval requires trusted server';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists appliance_guard_answer_approval on public.appliance_answers;
create trigger appliance_guard_answer_approval before insert or update
on public.appliance_answers for each row
execute function public.appliance_guard_answer_approval();

revoke execute on function public.appliance_guard_guidance_approval() from public, anon, authenticated;
revoke execute on function public.appliance_guard_answer_approval() from public, anon, authenticated;