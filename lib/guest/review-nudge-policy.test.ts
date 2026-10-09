import { describe, expect, it } from 'vitest';
import { canShowAutomaticPrompt, REVIEW_NUDGE_CHECK_LIMIT, REVIEW_NUDGE_IDLE_MS, safeReviewUrl } from './review-nudge-policy';

describe('review nudge URL boundary', () => {
  it('accepts an HTTPS host-configured review destination', () => { expect(safeReviewUrl('https://www.airbnb.com/reviews')).toBe('https://www.airbnb.com/reviews'); });
  it.each(['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://router.local/x', 'https://a.internal/x', '', 'not a url'])('rejects %s', (value) => { expect(safeReviewUrl(value)).toBeNull(); });
  it('rejects nonstrings and oversized links', () => { expect(safeReviewUrl(null)).toBeNull(); expect(safeReviewUrl('https://example.com/' + 'a'.repeat(2000))).toBeNull(); });
});
describe('guest-friendly automatic prompt policy', () => {
  const idle = { visible: true, focused: true, editing: false, elapsedMs: REVIEW_NUDGE_IDLE_MS, claimed: false };
  it('allows only a visible, focused, idle menu', () => { expect(canShowAutomaticPrompt(idle)).toBe(true); });
  it.each([{ visible: false }, { focused: false }, { editing: true }, { elapsedMs: REVIEW_NUDGE_IDLE_MS - 1 }, { claimed: true }])('suppresses an unsafe moment %j', (change) => { expect(canShowAutomaticPrompt({ ...idle, ...change })).toBe(false); });
  it('bounds eligibility checks and avoids immediate prompting', () => { expect(REVIEW_NUDGE_CHECK_LIMIT).toBe(4); expect(REVIEW_NUDGE_IDLE_MS).toBe(30_000); });
});
