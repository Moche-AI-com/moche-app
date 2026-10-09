export interface ReviewNudgePilot {
  enabled: boolean;
  allowDemo: boolean;
  demoReview: boolean;
}

// Input must come from the server-only app_settings row scoped to the
// authenticated session's property. This parses rollout flags, not entitlement.
// Callers must independently enforce session/property authorization and either
// a paid entitlement or the explicitly allowed, existing demo access grant.
export function readReviewNudgePilot(value: unknown, killSwitch?: string): ReviewNudgePilot {
  const disabled = { enabled: false, allowDemo: false, demoReview: false };
  if (killSwitch === 'false' || !value || typeof value !== 'object' || Array.isArray(value)) return disabled;
  const flags = value as Record<string, unknown>;
  if (flags.enabled !== true) return disabled;
  return { enabled: true, allowDemo: flags.allow_demo === true, demoReview: flags.demo_review === true };
}
