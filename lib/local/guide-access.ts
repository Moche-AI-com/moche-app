export type GuideAccessDecision = 'allow' | 'not_found' | 'verify';

/** Evaluate access only after the property's slug has resolved and the host guard has run. */
export function guestGuideAccess(
  propertyStatus: string,
  verifiedGuest: boolean,
  hostHasPropertyAccess: boolean,
): GuideAccessDecision {
  if (propertyStatus === 'archived') return 'not_found';
  if (propertyStatus !== 'live' && !hostHasPropertyAccess) return 'not_found';
  if (!verifiedGuest && !hostHasPropertyAccess) return 'verify';
  return 'allow';
}
