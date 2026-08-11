export const ACQUISITION_PROFILES = {
  property_site_v1: { timeoutMs: 30_000, maxBytes: 2_000_000, renderJs: true, useStealth: false, minTextLength: 100 },
  listing_public_v1: { timeoutMs: 30_000, maxBytes: 2_000_000, renderJs: true, useStealth: true, minTextLength: 20 },
  manual_site_v1: { timeoutMs: 20_000, maxBytes: 1_000_000, renderJs: false, useStealth: false, minTextLength: 20 },
  local_source_v1: { timeoutMs: 20_000, maxBytes: 1_000_000, renderJs: false, useStealth: false, minTextLength: 80 },
  document_url_v1: { timeoutMs: 45_000, maxBytes: 25_000_000, renderJs: false, useStealth: false, minTextLength: 20 },
} as const;

export type AcquisitionProfileName = keyof typeof ACQUISITION_PROFILES;
export type AcquisitionProfile = (typeof ACQUISITION_PROFILES)[AcquisitionProfileName];

export function profileFor(name: AcquisitionProfileName): AcquisitionProfile {
  return ACQUISITION_PROFILES[name];
}
