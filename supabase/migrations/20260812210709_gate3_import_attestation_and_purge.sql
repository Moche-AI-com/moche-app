-- Directive Section 0.4 legal position (D-0013): imports are host-initiated only,
-- from a URL the host pastes, with an explicit ownership attestation recorded at
-- the moment of import, full provenance retained, and a single host action that
-- removes everything the import produced.

alter table public.property_import_jobs
  add column if not exists ownership_attested_at timestamptz,
  add column if not exists ownership_attested_by uuid references public.profiles(id) on delete set null,
  -- The exact wording the host agreed to is stored, not just the fact that they
  -- agreed. If the attestation copy is revised later, an old row still shows what
  -- was actually presented.
  add column if not exists attestation_text text;

comment on column public.property_import_jobs.ownership_attested_at is
  'When the host attested they own or manage the listing at source_url. Null for jobs created before attestation was required.';

-- Provenance readback for the host: what was imported, from where, and when.
create or replace function public.property_import_provenance(p_property_id uuid)
returns table (
  job_id uuid,
  source_url text,
  provider text,
  fetched_at timestamptz,
  status public.property_import_job_status,
  ownership_attested_at timestamptz,
  attestation_text text,
  artifact_count bigint
)
language sql
security invoker
set search_path to ''
as $$
  select j.id,
         j.source_url,
         j.provider,
         coalesce(j.completed_at, j.updated_at, j.created_at),
         j.status,
         j.ownership_attested_at,
         j.attestation_text,
         (select count(*) from public.property_import_artifacts a where a.job_id = j.id)
  from public.property_import_jobs j
  where j.property_id = p_property_id
  order by j.created_at desc;
$$;

-- One host action removes the imported source material: the captured page text,
-- the extracted draft, and the job rows that reference the source URL. The
-- property itself and anything the host has since approved are deliberately left
-- alone; this is a right-to-erasure path for third-party source content, not a
-- property delete.
create or replace function public.property_import_purge(p_property_id uuid, p_actor uuid)
returns table (jobs_deleted integer, artifacts_deleted integer)
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_jobs uuid[];
  v_artifacts integer := 0;
  v_job_count integer := 0;
begin
  -- security invoker: RLS on property_import_jobs decides whether this caller can
  -- see the property's jobs at all, so a host cannot purge someone else's import.
  select coalesce(array_agg(id), '{}') into v_jobs
  from public.property_import_jobs
  where property_id = p_property_id;

  if array_length(v_jobs, 1) is null then
    return query select 0, 0;
    return;
  end if;

  delete from public.property_import_artifacts where job_id = any(v_jobs);
  get diagnostics v_artifacts = row_count;

  delete from public.property_import_jobs where id = any(v_jobs);
  get diagnostics v_job_count = row_count;

  insert into public.audit_logs (action, actor_type, actor_profile_id, property_id, target_type, metadata)
  values ('property.import_provenance_purged', 'host', p_actor, p_property_id, 'property_import_jobs',
          jsonb_build_object('jobs_deleted', v_job_count, 'artifacts_deleted', v_artifacts));

  return query select v_job_count, v_artifacts;
end $$;

revoke all on function public.property_import_provenance(uuid) from public;
revoke all on function public.property_import_purge(uuid, uuid) from public;
grant execute on function public.property_import_provenance(uuid) to authenticated, service_role;
grant execute on function public.property_import_purge(uuid, uuid) to authenticated, service_role;
