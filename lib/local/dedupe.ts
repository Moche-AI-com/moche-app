import { haversineMeters } from './distance';

export interface PlaceIdentity {
  provider: string;
  providerPlaceId: string | null;
  name: string;
  normalizedName: string;
  category: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
}

const LEGAL_SUFFIXES = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|plc)\b/g;

/** Canonicalize a name before persisting it or comparing candidates. */
export function normalizePlaceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePlaceAddress(address: string | null): string | null {
  if (!address) return null;
  const normalized = address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function metersBetween(a: PlaceIdentity, b: PlaceIdentity): number | null {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  return haversineMeters(a.lat, a.lon, b.lat, b.lon);
}

/**
 * Applies the canonical-place rules in their intentional precedence order.
 * `normalizedName` should normally come from `normalizePlaceName`, but accepting
 * it here keeps the identity comparison pure and makes imports deterministic.
 */
export function areSamePlace(a: PlaceIdentity, b: PlaceIdentity): boolean {
  if (a.provider === b.provider && a.providerPlaceId && b.providerPlaceId && a.providerPlaceId === b.providerPlaceId) {
    return true;
  }

  const distance = metersBetween(a, b);
  if (a.normalizedName === b.normalizedName && !!a.normalizedName && distance != null && distance < 150) {
    return true;
  }

  const sameCategory = a.category === b.category;
  if (!sameCategory) return false;
  const sameAddress = normalizePlaceAddress(a.address) !== null
    && normalizePlaceAddress(a.address) === normalizePlaceAddress(b.address);
  return sameAddress || (distance != null && distance < 50);
}

export function findDuplicate(candidate: PlaceIdentity, existing: PlaceIdentity[]): PlaceIdentity | null {
  return existing.find((place) => areSamePlace(candidate, place)) ?? null;
}
