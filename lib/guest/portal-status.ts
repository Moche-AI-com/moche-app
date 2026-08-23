// Portal visit-code lifecycle for a stay's access link. The raw 4-digit code is
// stored hash-only and can never be re-displayed, so the UI shows a masked
// placeholder plus this derived status (issue #59, ticket 3).
export interface PortalCodeState {
  codeExpiresAt: string | null;
  codeRevokedAt: string | null;
}

export type PortalCodeStatus = 'active' | 'expired' | 'revoked';

export function portalCodeStatus(portal: PortalCodeState, now: number = Date.now()): PortalCodeStatus {
  // Revoked wins over expired: a code the host killed reads as revoked even when
  // its window had already ended — the cause a host cares about is the revocation.
  if (portal.codeRevokedAt) return 'revoked';
  if (portal.codeExpiresAt && new Date(portal.codeExpiresAt).getTime() <= now) return 'expired';
  return 'active';
}
