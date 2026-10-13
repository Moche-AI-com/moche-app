export type DiscoverySource = 'osm' | 'mapbox_searchbox' | 'manual';

export type DiscoveryCandidate = {
  source: DiscoverySource;
  name: string;
  category: string;
  lat: number | null;
  lon: number | null;
  verifiedAt: Date | null;
  sourceRightsVerified: boolean;
  eligibleCategory: boolean;
  knownClosed?: boolean;
};

export type PublicationDecision = {
  status: 'approved' | 'suggested';
  reason: 'disabled' | 'temporary_source' | 'unlicensed_source' | 'ineligible_category' | 'invalid_place' | 'closed' | 'stale' | 'eligible';
  hostEndorsed: false;
};

export function evaluateDiscoveryPublication(
  candidate: DiscoveryCandidate,
  options: { enabled: boolean; now?: Date; maxAgeDays?: number },
): PublicationDecision {
  const suggested = (reason: PublicationDecision['reason']): PublicationDecision => ({
    status: 'suggested', reason, hostEndorsed: false,
  });
  if (!options.enabled) return suggested('disabled');
  if (candidate.source === 'mapbox_searchbox') return suggested('temporary_source');
  if (candidate.source !== 'osm' || !candidate.sourceRightsVerified) return suggested('unlicensed_source');
  if (!candidate.eligibleCategory) return suggested('ineligible_category');
  if (!candidate.name.trim() || !candidate.category.trim() ||
      candidate.lat === null || candidate.lon === null ||
      !Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lon) ||
      Math.abs(candidate.lat) > 90 || Math.abs(candidate.lon) > 180) return suggested('invalid_place');
  if (candidate.knownClosed) return suggested('closed');
  const ageLimit = options.maxAgeDays ?? 30;
  const now = options.now ?? new Date();
  if (!Number.isFinite(ageLimit) || ageLimit <= 0 ||
      !Number.isFinite(now.getTime()) ||
      !candidate.verifiedAt || !Number.isFinite(candidate.verifiedAt.getTime()) ||
      candidate.verifiedAt.getTime() > now.getTime() ||
      now.getTime() - candidate.verifiedAt.getTime() > ageLimit * 86_400_000) return suggested('stale');
  return { status: 'approved', reason: 'eligible', hostEndorsed: false };
}
