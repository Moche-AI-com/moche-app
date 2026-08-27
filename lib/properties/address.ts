// Shared one-line address used wherever a property card needs its location — the
// Properties tab and the Overview "Your properties" card both render this where
// the /slug link used to sit, e.g. "12 Ocean View Rd, Unit 2, Barcelona,
// Catalonia, 08001, Spain". Returns null when no street address is captured yet.
export interface PropertyAddressRow {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
}

export function cardAddress(p: PropertyAddressRow): string | null {
  if (!p.address_line1 || !p.address_line1.trim()) return null;
  return [p.address_line1, p.address_line2, p.city, p.region, p.postal_code, p.country]
    .filter(Boolean)
    .join(', ');
}
