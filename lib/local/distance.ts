// ---------------------------------------------------------------------------
// Distance presentation.
//
// Every distance in this codebase is STORED and COMPUTED in metres — that is
// the unit the OSM/Mapbox providers return and the unit `nearby_places.distance_m`
// holds. Metres stay the internal currency. This module is the single place
// where a distance becomes something a guest reads, and guests read miles.
//
// Keeping the conversion here (rather than inline at each call site, which is
// how three slightly different metric formatters drifted into existence) means
// the rounding rules are defined once and are unit-testable.
// ---------------------------------------------------------------------------

const FEET_PER_METRE = 3.280839895;
const METRES_PER_MILE = 1609.344;

// Below a tenth of a mile, feet are the more useful unit — this is the same
// threshold Google Maps uses for walking directions, so it reads as familiar
// rather than idiosyncratic.
const FEET_CUTOFF = 0.1 * METRES_PER_MILE; // ~161 m

/**
 * Format a distance in metres as a guest-facing imperial string.
 *
 * Returns `null` for a null/undefined/non-finite/negative input so callers can
 * decide how to render "we don't know how far this is" rather than being handed
 * a misleading "0 ft".
 *
 *   45     -> "150 ft"   (feet, rounded to the nearest 50)
 *   400    -> "0.2 mi"   (miles, one decimal)
 *   1609   -> "1.0 mi"
 */
export function formatDistance(metres: number | null | undefined): string | null {
  if (metres == null || !Number.isFinite(metres) || metres < 0) return null;

  if (metres < FEET_CUTOFF) {
    // Round to the nearest 50 ft, but never present "0 ft" — anything closer
    // than 25 ft is still meaningfully "about 50 ft away" to someone walking.
    const feet = Math.max(50, Math.round((metres * FEET_PER_METRE) / 50) * 50);
    return `${feet} ft`;
  }

  return `${(metres / METRES_PER_MILE).toFixed(1)} mi`;
}

/**
 * Approximate form used in prose and in the concierge's prompt context, e.g.
 * " (~0.4 mi)". Returns '' (not null) when the distance is unknown so it can be
 * concatenated into a sentence unconditionally.
 */
export function formatDistanceApprox(metres: number | null | undefined): string {
  const d = formatDistance(metres);
  return d ? ` (~${d})` : '';
}

/**
 * "0.4 mi away" — used where the distance stands alone as its own phrase.
 * Returns null when unknown.
 */
export function formatDistanceAway(metres: number | null | undefined): string | null {
  const d = formatDistance(metres);
  return d ? `${d} away` : null;
}

/**
 * Bare mileage for prose like "within ~1.2 miles of your property". Distinct
 * from formatDistance because it spells out the unit and always uses miles —
 * it describes a search radius, not a specific place's proximity.
 */
export function formatRadiusMiles(metres: number): string {
  return `${(metres / METRES_PER_MILE).toFixed(1)} miles`;
}
