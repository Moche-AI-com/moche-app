-- Part C: host self-service enrichment for recommendations (ADDITIVE ONLY).
-- Lets hosts curate AI/OSM-sourced local intel: approve, favorite (loved),
-- hide from the concierge, weight priority, and annotate. lat/lng cache geocoding.
DO $$ BEGIN
  CREATE TYPE host_preference AS ENUM ('loved','neutral','disliked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS ai_source_rating numeric,
  ADD COLUMN IF NOT EXISTS host_preference host_preference NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS host_note text,
  ADD COLUMN IF NOT EXISTS priority_weight integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_source text,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;

-- Existing host-entered recs are approved by default; AI/OSM-staged rows will be
-- inserted with approved=false so they require host review before going live.
COMMENT ON COLUMN recommendations.approved IS 'AI/OSM-staged rows start false (pending host review); host-entered rows are true.';
COMMENT ON COLUMN recommendations.host_preference IS 'loved rows are boosted, disliked rows are down-weighted, in concierge local answers.';
COMMENT ON COLUMN recommendations.hidden IS 'true = never surfaced to the concierge/guests.';
COMMENT ON COLUMN recommendations.ai_source IS 'provenance, e.g. osm_overpass, google_places, host.';

CREATE INDEX IF NOT EXISTS idx_recommendations_property_live
  ON recommendations (property_id)
  WHERE deleted_at IS NULL AND hidden = false AND approved = true;
