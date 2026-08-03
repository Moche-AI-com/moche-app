// Canonical nearby-place category list. Single source of truth for category
// keys, ordering, and labels — imported by both server code (concierge.ts,
// prompt construction) and client code (GuestPortal.tsx, NearbyPlacesManager,
// RecommendationsManager). No 'server-only' import here on purpose: this file
// must be safely importable from the browser bundle.
//
// Two label forms exist because the two consumers want different grammar:
//   - singular: "Restaurant" — used inline in prompts/badges ("(Restaurant)")
//   - plural:   "Restaurants" — used as filter-chip/section-header text
// Keep both forms here rather than deriving one from the other so a
// pluralization edge case (e.g. "Bar/Pub" -> "Bars & pubs") never needs
// string-munging logic.

export const NEARBY_CATEGORIES = [
  'restaurant',
  'cafe',
  'bar',
  'grocery',
  'pharmacy',
  'hospital',
  'tourist_attraction',
  'golf_course',
  'convenience_store',
  'bakery',
  'park',
  'gas_station',
] as const;

export type NearbyCategory = (typeof NEARBY_CATEGORIES)[number];

export const NEARBY_CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar/Pub',
  grocery: 'Grocery',
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  tourist_attraction: 'Attraction',
  golf_course: 'Golf course',
  convenience_store: 'Convenience store',
  bakery: 'Bakery',
  park: 'Park',
  gas_station: 'Gas station',
};

export const NEARBY_CATEGORY_LABEL_PLURAL: Record<string, string> = {
  restaurant: 'Restaurants',
  cafe: 'Cafes',
  bar: 'Bars & pubs',
  grocery: 'Groceries',
  pharmacy: 'Pharmacies',
  hospital: 'Hospitals',
  tourist_attraction: 'Attractions',
  golf_course: 'Golf courses',
  convenience_store: 'Convenience stores',
  bakery: 'Bakeries',
  park: 'Parks',
  gas_station: 'Gas stations',
};

// WS-6: trip-planning tags a host can apply to a curated place. Enforced in
// application code (not a DB check constraint) so new tags ship without a
// migration. Keep the `value` stable — it's what's persisted in
// nearby_places.tags — and change only the `label` freely.
export const CURATION_TAGS = [
  { value: 'kid_friendly', label: 'Kid-friendly' },
  { value: 'dog_friendly', label: 'Dog-friendly' },
  { value: 'walkable', label: 'Walkable' },
  { value: 'rainy_day', label: 'Rainy day' },
  { value: 'date_night', label: 'Date night' },
  { value: 'late_night', label: 'Late night' },
] as const;

export type CurationTag = (typeof CURATION_TAGS)[number]['value'];

export const CURATION_TAG_LABEL: Record<string, string> = Object.fromEntries(
  CURATION_TAGS.map((t) => [t.value, t.label]),
);
