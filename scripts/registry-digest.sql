-- Recompute the field_registry canonical digest inside Postgres.
--
-- This is the database half of the seed proof. The Python half is
--   python3 scripts/registry-seed-chunks.py digest
-- which computes the same digest from field_registry.json alone.
--
-- Canonical form (must stay in lockstep with canonical_rows() in
-- scripts/registry-seed-chunks.py):
--   * the 21 registry columns, in table order, joined by \x1f
--   * rows ordered by field_id under "C" collation, joined by \x1e
--   * sha256 of the whole, hex encoded
--
-- Two formatting notes that are load-bearing:
--   * jsonb::text renders ", " between array elements; Python's json.dumps with
--     compact separators renders ",". The replace() below normalizes to the
--     compact form. Safe because no enum value contains the sequence ", ".
--   * gap_weight is numeric(4,2), so ::text yields "1.00" and matches Python's
--     "%.2f". Do not change the column type without changing both sides.
--
-- If the two digests agree, the materialized table is byte-faithful to the JSON
-- regardless of how the seed SQL was transported.

with canon as (
  select
    field_id,
    array_to_string(array[
      field_id,
      label,
      domain,
      case when system_section then 't' else 'f' end,
      type,
      coalesce(replace(enum_values::text, ', ', ','), ''),
      sensitivity_tier::text,
      default_audience::text,
      array_to_string(phase, ','),
      coalesce(ttl_days::text, ''),
      storage_table,
      storage_column,
      case when storage_vault then 't' else 'f' end,
      gap_weight::text,
      case when hard_block then 't' else 'f' end,
      applicability,
      case when requires_on_failure then 't' else 'f' end,
      coalesce(on_failure_field, ''),
      coalesce(scrape_hint, ''),
      interview_prompt,
      registry_version::text
    ], chr(31)) as row_text
  from public.field_registry
)
select
  count(*)                                                     as rows,
  encode(digest(string_agg(row_text, chr(30)
                           order by field_id collate "C"), 'sha256'), 'hex') as db_digest,
  (select count(*) from public.field_registry where gap_weight > 0)      as scored,
  (select count(*) from public.field_registry where hard_block)          as hard_blocks,
  (select count(distinct domain) from public.field_registry)             as domains
from canon;

-- Per-row digests, for isolating which row diverges when the totals disagree.
-- Uncomment to use.
--
-- select field_id,
--        encode(digest(row_text, 'sha256'), 'hex') as h
-- from canon
-- order by field_id collate "C";
