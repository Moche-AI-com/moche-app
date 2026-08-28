-- Auto-create profile + host account on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_account uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));

  insert into public.host_accounts (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)) || '''s account', new.id)
  returning id into new_account;

  insert into public.organization_members (host_account_id, profile_id, role, accepted_at)
  values (new_account, new.id, 'host_owner', now());
  return new;
end;$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- updated_at maintainer
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

do $$declare t text;
begin
  foreach t in array array['profiles','host_accounts','properties','property_settings','brain_items','documents','ingestion_jobs','stays','conversations','escalations','service_requests','subscriptions']
  loop
    execute format('drop trigger if exists trg_updated_%1$s on %1$s; create trigger trg_updated_%1$s before update on %1$s for each row execute function set_updated_at();', t);
  end loop;
end$$;

-- SECURITY DEFINER helpers (avoid RLS recursion)
create or replace function is_account_member(acc uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from organization_members m where m.host_account_id = acc and m.profile_id = auth.uid());
$$;

create or replace function is_account_owner(acc uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from host_accounts a where a.id = acc and a.owner_id = auth.uid());
$$;

create or replace function can_access_property(prop uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from properties p
    join host_accounts a on a.id = p.host_account_id
    where p.id = prop and a.owner_id = auth.uid()
  ) or exists(
    select 1 from property_members pm where pm.property_id = prop and pm.profile_id = auth.uid()
  );
$$;

create or replace function can_edit_property(prop uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from properties p join host_accounts a on a.id = p.host_account_id
    where p.id = prop and a.owner_id = auth.uid()
  ) or exists(
    select 1 from property_members pm where pm.property_id = prop and pm.profile_id = auth.uid() and pm.can_edit_brain = true
  );
$$;

create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and is_admin = true);
$$;

create or replace function property_account(prop uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select host_account_id from properties where id = prop;
$$;
