#!/usr/bin/env bash
# Isolated, Unix-socket-only PostgreSQL. Never connects to a hosted database.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/appliance-guidance-sql.XXXXXX")"
PORT=55589
mkdir "$WORK/socket"
trap '"$PGBIN/pg_ctl" -D "$WORK/data" stop >/dev/null 2>&1 || true' EXIT
"$PGBIN/initdb" -D "$WORK/data" -U "$(id -un)" --auth=trust > "$WORK/init.log"
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK/socket -c listen_addresses=''" -l "$WORK/server.log" start >/dev/null
"$PGBIN/createdb" -h "$WORK/socket" -p "$PORT" -U "$(id -un)" appliance_contract
dbsql() { "$PGBIN/psql" -X -h "$WORK/socket" -p "$PORT" -U "$(id -un)" -d appliance_contract -v ON_ERROR_STOP=1 "$@"; }
dbsql -f "$ROOT/scripts/gate2-local-stubs.sql" > "$WORK/setup.log"
dbsql >> "$WORK/setup.log" <<'SQL'
create table public.profiles (id uuid primary key);
create table public.property_appliances (
  id uuid primary key, property_id uuid not null references public.properties(id),
  model_number text, updated_at timestamptz not null default now()
);
alter table public.property_appliances enable row level security;
create policy appliance_select on public.property_appliances for select to authenticated using (public.can_access_property(property_id));
create policy appliance_update on public.property_appliances for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
grant select, update on public.property_appliances to authenticated;
SQL
MIGRATION="$ROOT/supabase/migrations/20260928145500_appliance_guest_guidance.sql"
dbsql -f "$MIGRATION" > "$WORK/apply.log"
dbsql -f "$MIGRATION" > "$WORK/reapply.log"
dbsql > "$WORK/fixtures.log" <<'SQL'
insert into public.profiles values ('00000000-0000-4000-8000-000000000011'), ('00000000-0000-4000-8000-000000000022');
insert into public.properties(id, name) values
  ('00000000-0000-4000-8000-000000000001','Property A'),
  ('00000000-0000-4000-8000-000000000002','Property B');
insert into public.property_members(property_id, profile_id, can_edit) values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',true),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022',true);
insert into public.property_appliances(id, property_id, model_number, guest_guidance, guidance_approved_at) values
  ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','MODEL-1','Press Start',now()),
  ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000002','MODEL-2','Press Start',now());
insert into public.appliance_answers(id,property_id,appliance_id,question,answer,source_kind,model_number_snapshot,status,approved_at) values
  ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','How do I start it?','Press Start','host','MODEL-1','approved',now()),
  ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000202','How do I start it?','Press Start','host','MODEL-2','approved',now());
SQL
dbsql > "$WORK/rls.log" <<'SQL'
set role authenticated;
set test.user_id = '00000000-0000-4000-8000-000000000011';
do $$ begin
  if (select count(*) from public.appliance_answers) <> 1 then
    raise exception 'Property A can see another property answer';
  end if;
end $$;
update public.property_appliances set model_number = 'MODEL-NEW'
  where id = '00000000-0000-4000-8000-000000000101';
SQL
dbsql <<'SQL' > "$WORK/revocation.log"
do $$ begin
  if exists (select 1 from public.appliance_answers
    where id = '00000000-0000-4000-8000-000000000301' and status <> 'draft') then
    raise exception 'Model change did not revoke approved answer';
  end if;
  if exists (select 1 from public.property_appliances
    where id = '00000000-0000-4000-8000-000000000101' and guidance_approved_at is not null) then
    raise exception 'Model change did not revoke approved guidance';
  end if;
  if (select count(*) from public.appliance_answers where status = 'approved') <> 1 then
    raise exception 'Model change affected another property';
  end if;
end $$;
update public.appliance_answers set status = 'approved', approved_at = now()
  where id = '00000000-0000-4000-8000-000000000301';
update public.appliance_answers set answer = 'Changed instruction'
  where id = '00000000-0000-4000-8000-000000000301';
do $$ begin
  if exists (select 1 from public.appliance_answers
    where id = '00000000-0000-4000-8000-000000000301'
      and (status <> 'draft' or approved_at is not null)) then
    raise exception 'Editing approved answer retained approval';
  end if;
end $$;
SQL
if dbsql -c 'set role anon; select id from public.appliance_answers' > "$WORK/anon.log" 2>&1; then
  echo 'FAIL: anonymous role can read appliance answers'
  exit 1
fi
if dbsql -c "insert into public.appliance_answers(property_id,appliance_id,question,answer,source_kind) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000202','Mismatch','No','host')" > "$WORK/fk.log" 2>&1; then
  echo 'FAIL: appliance from another property accepted'
  exit 1
fi
echo 'PASS: migration apply and reapply; tenant RLS, model/edit revocation, anon denial and composite FK'
