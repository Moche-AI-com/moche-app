-- Door codes are host-only (policy decision 2026-10-01).
-- Applied to production 2026-10-01 as version 20261001122531.
--
-- Hosts may keep a door/access code in Moche-AI for their own reference. It stays
-- in Vault (secret_ref_or_ciphertext only) at tier host_only / audience
-- host_private, which the audience matrix keeps off every guest surface. It is
-- never sent to a model and never shown to a guest: guest entry-code questions
-- are escalated to the host (lib/guest/credential-questions.ts +
-- app/api/guest/[slug]/chat/route.ts). Guests get entry_instructions instead:
-- how to get in, written without the code. It replaces the door code as the
-- access hard block, the same way wifi_password_location replaced wifi_password.

-- 1. Door code: host-only, optional, unscored. Still Vault-routed.
update public.field_registry
   set label = 'Door / access code (host only)',
       sensitivity_tier = 'host_only',
       default_audience = 'host_private',
       gap_weight = 0,
       hard_block = false,
       interview_prompt = 'Optional, for your own records. Stored encrypted and never shown to guests or the AI. Guests who ask for a code are routed to you.'
 where field_id = 'door_code_or_entry_method';

-- Existing envelopes follow the registry (none in production today).
update public.brain_values
   set sensitivity_tier = 'host_only', audience = 'host_private'
 where field_id = 'door_code_or_entry_method'
   and (sensitivity_tier <> 'host_only' or audience <> 'host_private');

-- 2. Guest-safe entry instructions become the access hard block.
insert into public.field_registry (
  field_id, label, domain, system_section, type, enum_values, sensitivity_tier, default_audience,
  phase, ttl_days, storage_table, storage_column, storage_vault, gap_weight, hard_block,
  applicability, requires_on_failure, on_failure_field, scrape_hint, interview_prompt, registry_version
) values (
  'entry_instructions', 'Guest entry instructions', 'access_security', false, 'text', null,
  'guest_after_verification', 'guest_instay', array['pre-arrival', 'check-in']::text[], 365,
  'brain_values', 'value', false, 3.0, true, 'always', true, 'access_backup_method', null,
  'How do guests get inside? Describe the steps without the code itself, e.g. ''Your host texts your door code on arrival day'' or ''The lockbox is to the left of the front door.'' Never type the code here.',
  1
)
on conflict (field_id) do update set
  label = excluded.label, domain = excluded.domain, system_section = excluded.system_section,
  type = excluded.type, enum_values = excluded.enum_values, sensitivity_tier = excluded.sensitivity_tier,
  default_audience = excluded.default_audience, phase = excluded.phase, ttl_days = excluded.ttl_days,
  storage_table = excluded.storage_table, storage_column = excluded.storage_column,
  storage_vault = excluded.storage_vault, gap_weight = excluded.gap_weight, hard_block = excluded.hard_block,
  applicability = excluded.applicability, requires_on_failure = excluded.requires_on_failure,
  on_failure_field = excluded.on_failure_field, scrape_hint = excluded.scrape_hint,
  interview_prompt = excluded.interview_prompt, registry_version = excluded.registry_version;

-- 3. Vault writes are server-side only. The app already calls this through the
-- service-role client (lib/brain/values.ts); removing the authenticated grant
-- closes the /rest/v1/rpc endpoint flagged by the security advisor.
revoke execute on function public.brain_values_set_secret(uuid, text, text, uuid) from authenticated;

-- 4. Host-only read for the host's own dashboard. service_role only, and it
-- refuses any field that is not a host_only Vault secret (so wifi_password and
-- every guest-tier field are unreadable through it).
create or replace function public.brain_values_read_host_secret(p_property_id uuid, p_field_id text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce(current_setting('role', true), '');
  v_tier public.sensitivity_tier;
  v_ref text;
  v_secret text;
begin
  if v_role <> 'service_role' then
    raise exception 'host secrets are read server-side only' using errcode = '42501';
  end if;
  select r.sensitivity_tier into v_tier
    from public.field_registry r
   where r.field_id = p_field_id and r.type = 'secret' and r.storage_vault;
  if v_tier is distinct from 'host_only'::public.sensitivity_tier then
    raise exception 'field % is not a host-only secret', p_field_id using errcode = '42501';
  end if;
  select bv.secret_ref_or_ciphertext into v_ref
    from public.brain_values bv
   where bv.property_id = p_property_id and bv.field_id = p_field_id and bv.status = 'active'
   order by bv.version desc
   limit 1;
  if v_ref is null or v_ref !~ '^vault:' then
    return null;
  end if;
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
   where ds.id = replace(v_ref, 'vault:', '')::uuid;
  return v_secret;
end;
$function$;

revoke all on function public.brain_values_read_host_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.brain_values_read_host_secret(uuid, text) to service_role;
