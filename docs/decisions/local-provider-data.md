# Local provider data decision

## Decision

Moche-AI stores only host-entered and OpenStreetMap-derived place records in the durable `places` table. Mapbox Search Box results are displayed only for the active host search request and are never written to `places`, `property_place_recommendations`, analytics payloads, logs, or backups by this feature.

## Why

Mapbox's Search Box documentation says data returned by every Search Box endpoint is available only for temporary use and says to contact Mapbox sales if stored position data is required. Mapbox's product page states directly that Search Box results cannot be stored. The Search Box API is therefore an ephemeral discovery aid, not a source for our canonical place records.

- https://docs.mapbox.com/api/search/search-box/
- https://www.mapbox.com/search-box

## Storage and retention

| Source | Durable storage | Retention |
| --- | --- | --- |
| OpenStreetMap / Overpass | Canonical place and property relationship | Until a host hides or removes it, subject to normal account deletion |
| Host manual entry | Canonical place and property relationship | Until a host hides or removes it, subject to normal account deletion |
| Mapbox Search Box | None | Request/session memory only; not persisted or logged |

## Operational gate

A host cannot add a Mapbox result directly. The UI labels it as temporary and directs the host to add the place manually. Existing legacy rows whose source is `mapbox` are intentionally not migrated into the new canonical tables. If product requirements need durable Mapbox POIs, obtain written approval for a Mapbox product and terms that permit that storage, then revisit this decision before enabling persistence.
