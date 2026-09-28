#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | tail -1)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/appliance-approval.XXXXXX")"
mkdir "$WORK/socket"
trap '"$PGBIN/pg_ctl" -D "$WORK/data" stop >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
"$PGBIN/initdb" -D "$WORK/data" -U "$(id -un)" --auth=trust > "$WORK/init.log"
"$PGBIN/pg_ctl" -D "$WORK/data" -o "-p 55590 -k $WORK/socket -c listen_addresses=''" -l "$WORK/server.log" start >/dev/null
"$PGBIN/createdb" -h "$WORK/socket" -p 55590 -U "$(id -un)" appliance_guard
dbsql() { "$PGBIN/psql" -X -h "$WORK/socket" -p 55590 -U "$(id -un)" -d appliance_guard -v ON_ERROR_STOP=1 "$@"; }
dbsql -f "$ROOT/scripts/gate2-local-stubs.sql" > "$WORK/setup.log"
dbsql >> "$WORK/setup.log" <<'SQL'
create table public.profiles (id uuid primary key);
create table public.property_appliances (id uuid primary key, property_id uuid not null references public.properties(id), model_number text, updated_at timestamptz not null default now());
alter table public.property_appliances enable row level security;
create policy appliance_select on public.property_appliances for select to authenticated using (public.can_access_property(property_id));
create policy appliance_update on public.property_appliances for update to authenticated using (public.can_edit_property(property_id)) with check (public.can_edit_property(property_id));
grant select, update on public.property_appliances to authenticated;
SQL
for pass in 1 2; do
  dbsql -f "$ROOT/supabase/migrations/20260928145500_appliance_guest_guidance.sql" > "$WORK/base-$pass.log"
  dbsql -f "$ROOT/supabase/migrations/20260928190000_appliance_approval_write_guard.sql" > "$WORK/guard-$pass.log"
done
dbsql > "$WORK/fixtures.log" <<'SQL'
insert into public.profiles values ('00000000-0000-4000-8000-000000000011');
insert into public.properties(id,name) values ('00000000-0000-4000-8000-000000000001','Property A');
insert into public.property_members(property_id,profile_id,can_edit) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',true);
insert into public.property_appliances(id,property_id,model_number,guest_guidance) values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','MODEL-1','Press Start');
SQL
AUTH="set role authenticated; set test.user_id = '00000000-0000-4000-8000-000000000011';"
if dbsql -c "$AUTH update public.property_appliances set guidance_approved_at=now() where id='00000000-0000-4000-8000-000000000101';" > "$WORK/forged-guidance.log" 2>&1; then echo 'FAIL: authenticated client approved guidance'; exit 1; fi
dbsql -c "$AUTH insert into public.appliance_answers(property_id,appliance_id,question,answer,source_kind) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','How to start?','Press Start','host');" > "$WORK/draft.log"
if dbsql -c "$AUTH update public.appliance_answers set status='approved',approved_at=now() where appliance_id='00000000-0000-4000-8000-000000000101';" > "$WORK/forged-answer.log" 2>&1; then echo 'FAIL: authenticated client approved an answer'; exit 1; fi
if dbsql -c "$AUTH insert into public.appliance_answers(property_id,appliance_id,question,answer,source_kind,status,approved_at) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','Forged?','Yes','host','approved',now());" > "$WORK/forged-insert.log" 2>&1; then echo 'FAIL: authenticated client inserted approved answer'; exit 1; fi
dbsql <<'SQL' > "$WORK/trusted.log"
update public.property_appliances set guidance_approved_at=now() where id='00000000-0000-4000-8000-000000000101';
update public.appliance_answers set status='approved', approved_at=now() where appliance_id='00000000-0000-4000-8000-000000000101';
do $$ begin
  if (select count(*) from public.appliance_answers where status='approved') <> 1 then raise exception 'trusted approval failed'; end if;
  if not exists(select 1 from public.property_appliances where guidance_approved_at is not null) then raise exception 'trusted guidance approval failed'; end if;
end $$;
SQL
echo 'PASS: repeatable migrations, draft writes, client self-approval denied, trusted approval allowed'