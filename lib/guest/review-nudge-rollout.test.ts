import { describe, expect, it } from 'vitest';
import { readReviewNudgePilot } from './review-nudge-rollout';

describe('property-scoped Review Nudge pilot flags', () => {
  const disabled = { enabled: false, allowDemo: false, demoReview: false };
  it.each([null, undefined, true, 'true', [], {}, { enabled: 'true' }, { enabled: false, allow_demo: true, demo_review: true }])('fails closed for %j', (value) => {
    expect(readReviewNudgePilot(value)).toEqual(disabled);
  });
  it('requires explicit flags for demo entitlement and demo copy', () => {
    expect(readReviewNudgePilot({ enabled: true })).toEqual({ enabled: true, allowDemo: false, demoReview: false });
    expect(readReviewNudgePilot({ enabled: true, allow_demo: 'true', demo_review: 1 })).toEqual({ enabled: true, allowDemo: false, demoReview: false });
  });
  it('parses the explicit demo pilot without creating an entitlement', () => {
    expect(readReviewNudgePilot({ enabled: true, allow_demo: true, demo_review: true })).toEqual({ enabled: true, allowDemo: true, demoReview: true });
  });
  it('allows an explicit kill switch to disable the pilot', () => {
    expect(readReviewNudgePilot({ enabled: true, allow_demo: true, demo_review: true }, 'false')).toEqual(disabled);
  });
  it('never globally enables an unconfigured property', () => {
    expect(readReviewNudgePilot(null, 'true')).toEqual(disabled);
    expect(readReviewNudgePilot({}, 'true')).toEqual(disabled);
  });
});
