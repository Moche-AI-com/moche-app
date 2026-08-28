create or replace function public.prevent_is_admin_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if coalesce(auth.role(), '') is distinct from 'service_role' then
      new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_is_admin_self_update on public.profiles;
create trigger trg_prevent_is_admin_self_update
before update on public.profiles
for each row execute function public.prevent_is_admin_self_update();
