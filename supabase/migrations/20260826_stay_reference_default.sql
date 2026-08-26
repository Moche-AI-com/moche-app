-- Patch: give stays.stay_reference a self-generating DEFAULT.
-- Date: 2026-08-26
-- Applied to production Supabase (project sqpdzhannyskdiyuarhp) on 2026-08-26
-- as migration "stay_reference_default".
--
-- Why: add_stay_reference (applied earlier the same day) made the column NOT
-- NULL, but the app-side generator only ships with the reports-rework PR. Any
-- stay created in that window would fail the insert. With this default, an
-- insert that omits stay_reference still succeeds; the app code overrides the
-- default with its own wider-alphabet, collision-retried value once deployed.
-- Reversible: ALTER TABLE public.stays ALTER COLUMN stay_reference DROP DEFAULT;

BEGIN;

ALTER TABLE public.stays
  ALTER COLUMN stay_reference
  SET DEFAULT ('STY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));

COMMIT;
