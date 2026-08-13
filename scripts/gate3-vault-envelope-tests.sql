-- Contract tests for the Gate 3 Vault envelope (D-0011 part b).
--
-- Deliberately a single DO block that ends in RAISE: the exception rolls the whole
-- thing back, so running this against production leaves no synthetic secret and no
-- brain_values row behind. Success looks like `ASSERTIONS ALL_PASS`; any other suffix
-- names the assertions that failed.
--
-- Run: psql "$DATABASE_URL" -f scripts/gate3-vault-envelope-tests.sql
do $$
declare
  r text := '';
  v_prop uuid;
  v_actor uuid;
  v_id uuid;
  v_row public.brain_values;
  v_plain text := 'contract-test-secret-'||gen_random_uuid()::text;
  v_ok boolean;
begin
  -- Impersonate the trusted server writer; A8 drops back to an unauthorized role.
  perform set_config('role','service_role',true);
  select id into v_prop from public.properties limit 1;
  select id into v_actor from public.profiles limit 1;

  -- A1: plaintext into a vault-routed field is refused.
  begin
    perform public.brain_values_set(v_prop,'wifi_password','"plain"'::jsonb,'host_verified',1,v_actor);
    r := r || 'A1_FAIL_accepted_plaintext; ';
  exception when others then
    if sqlstate <> '23514' then r := r || 'A1_FAIL_code('||sqlstate||'); '; end if;
  end;

  -- A2: a malformed ref is refused by the table constraint.
  begin
    perform public.brain_values_set(v_prop,'wifi_password',null,'host_verified',1,v_actor,'notavault');
    r := r || 'A2_FAIL_accepted_bad_ref; ';
  exception when others then
    if sqlstate not in ('23514','22P02') then r := r || 'A2_FAIL_code('||sqlstate||'); '; end if;
  end;

  -- A3: a ref on a non-vault field is refused (no second storage path).
  begin
    perform public.brain_values_set(v_prop,'checkout_time','"11:00"'::jsonb,'host_verified',1,v_actor,'vault:'||gen_random_uuid()::text);
    r := r || 'A3_FAIL_accepted_ref_on_plain_field; ';
  exception when others then
    if sqlstate <> '23514' then r := r || 'A3_FAIL_code('||sqlstate||'); '; end if;
  end;

  -- A4: the vault path writes a conforming row.
  v_id := public.brain_values_set_secret(v_prop,'wifi_password',v_plain,v_actor);
  select * into v_row from public.brain_values where id = v_id;
  if v_row.value is not null then r := r || 'A4_FAIL_value_not_null; '; end if;
  if v_row.secret_ref_or_ciphertext !~ '^vault:[0-9a-f-]{36}$' then r := r || 'A4_FAIL_ref_shape; '; end if;
  if v_row.ttl_expires_at is null then r := r || 'A4_FAIL_no_ttl; '; end if;
  if v_row.sensitivity_tier::text <> 'stay_scoped_secret' then r := r || 'A4_FAIL_tier('||v_row.sensitivity_tier::text||'); '; end if;

  -- A5: the plaintext round-trips through Vault and appears nowhere in the table.
  select exists(select 1 from vault.decrypted_secrets s
                 where s.id = replace(v_row.secret_ref_or_ciphertext,'vault:','')::uuid
                   and s.decrypted_secret = v_plain) into v_ok;
  if not v_ok then r := r || 'A5_FAIL_vault_roundtrip; '; end if;
  if exists (select 1 from public.brain_values where value::text like '%'||v_plain||'%') then
    r := r || 'A5_FAIL_plaintext_in_table; ';
  end if;

  -- A6: an empty secret is not a secret.
  begin
    perform public.brain_values_set_secret(v_prop,'wifi_password','   ',v_actor);
    r := r || 'A6_FAIL_accepted_empty; ';
  exception when others then
    if sqlstate <> '23514' then r := r || 'A6_FAIL_code('||sqlstate||'); '; end if;
  end;

  -- A7: the secret path refuses a non-vault field.
  begin
    perform public.brain_values_set_secret(v_prop,'checkout_time','x',v_actor);
    r := r || 'A7_FAIL_accepted_nonvault; ';
  exception when others then
    if sqlstate <> '23514' then r := r || 'A7_FAIL_code('||sqlstate||'); '; end if;
  end;

  -- A8: without service_role and without can_edit_property, the call is refused.
  perform set_config('role','none',true);
  begin
    perform public.brain_values_set_secret(v_prop,'wifi_password','x',v_actor);
    r := r || 'A8_FAIL_unauthorized_accepted; ';
  exception when others then
    if sqlstate <> '42501' then r := r || 'A8_FAIL_code('||sqlstate||'); '; end if;
  end;

  raise exception 'ASSERTIONS %', coalesce(nullif(r,''),'ALL_PASS');
end $$;
