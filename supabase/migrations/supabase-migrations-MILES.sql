-- ---------------------------------------------------------------------------
-- MILES — convert persisted distance strings from metric to imperial.
--
-- Context: distances are computed and stored in metres everywhere (that is what
-- the OSM/Mapbox providers return, and what `nearby_places.distance_m` holds).
-- Metres remain the internal unit and are NOT touched by this migration.
--
-- The problem is that `recommendations.distance_note` and the distance segment
-- of `recommendations.description` are *rendered strings*, frozen at the moment
-- the row was discovered. Changing the application formatter to miles leaves
-- those existing rows reading "1.8 km away" to guests forever, so they have to
-- be regenerated in place.
--
-- Rather than parsing the old strings (which had already been rounded to the
-- nearest 50 m / 0.1 km and would compound that error), the distance is
-- recomputed from the stored coordinates with the same haversine the providers
-- use, then re-rendered with the same rounding rules as
-- `lib/local/distance.ts#formatDistanceAway`:
--
--     < 0.1 mi  ->  feet, nearest 50, floor of 50 ft
--     >= 0.1 mi ->  miles, one decimal
--
-- The two implementations were cross-checked row by row against the TypeScript
-- formatter before this was applied; all 42 affected rows agreed exactly.
--
-- Idempotent: the guard `r.distance_note = d.old_note AND d.new_note <> d.old_note`
-- means a second run matches nothing. Safe to re-apply.
--
-- Applied: 2026-08-03 — 42 rows updated.
-- ---------------------------------------------------------------------------

BEGIN;

WITH d AS (
  SELECT
    r.id,
    r.distance_note AS old_note,
    CASE
      WHEN m.metres < 160.9344
        THEN GREATEST(50, ROUND((m.metres * 3.280839895)::numeric / 50) * 50)::bigint::text || ' ft away'
      ELSE TO_CHAR(ROUND((m.metres / 1609.344)::numeric, 1), 'FM999990.0') || ' mi away'
    END AS new_note
  FROM public.recommendations r
  JOIN public.properties p ON p.id = r.property_id
  CROSS JOIN LATERAL (
    SELECT 2 * 6371000 * asin(sqrt(
      power(sin(radians(r.lat::float8 - p.lat::float8) / 2), 2)
      + cos(radians(p.lat::float8)) * cos(radians(r.lat::float8))
        * power(sin(radians(r.lng::float8 - p.lng::float8) / 2), 2)
    )) AS metres
  ) m
  WHERE r.lat IS NOT NULL
    AND r.lng IS NOT NULL
    AND p.lat IS NOT NULL
    AND p.lng IS NOT NULL
    AND r.distance_note IS NOT NULL
)
UPDATE public.recommendations r
SET
  distance_note = d.new_note,
  -- The description embeds the same phrase between " · " separators. Swapping
  -- only that substring leaves any host-authored text in the field intact.
  description = CASE
    WHEN r.description IS NULL THEN NULL
    ELSE replace(r.description, d.old_note, d.new_note)
  END
FROM d
WHERE r.id = d.id
  AND r.distance_note = d.old_note
  AND d.new_note <> d.old_note;

COMMIT;

-- Verification (expects metric_notes = 0, metric_desc = 0):
--
--   SELECT count(*) FILTER (WHERE distance_note ILIKE '%km%'
--                              OR distance_note ~ '[0-9] m away') AS metric_notes,
--          count(*) FILTER (WHERE description ILIKE '%km%'
--                              OR description ~ '[0-9] m ')       AS metric_desc
--   FROM public.recommendations;

-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- There is no exact inverse: the original strings were themselves rounded, so
-- re-deriving "1.8 km away" from "1.1 mi away" would not always reproduce the
-- prior value. To revert, restore the metric formatter in lib/local/distance.ts
-- and re-run this migration's SELECT with the metric CASE below.
--
-- CASE WHEN m.metres < 950
--        THEN (ROUND(m.metres::numeric / 50) * 50)::bigint::text || ' m away'
--      ELSE TO_CHAR(ROUND((m.metres / 1000)::numeric, 1), 'FM999990.0') || ' km away'
-- END
-- ---------------------------------------------------------------------------
