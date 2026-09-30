import { describe, expect, it } from 'vitest';
import { smsFailureMessage, type SmsFailureReason } from './delivery-outcome';

describe('smsFailureMessage', () => {
  it('gives each failure a specific, non-generic message and status', () => {
    const reasons: SmsFailureReason[] = ['invalid_phone', 'sms_disabled', 'opted_out', 'provider_failed'];
    const seen = new Set<string>();
    for (const reason of reasons) {
      const { error, status } = smsFailureMessage(reason);
      expect(error.length).toBeGreaterThan(10);
      expect(error).not.toMatch(/may not be configured/i);
      expect(status).toBeGreaterThanOrEqual(400);
      seen.add(error);
    }
    expect(seen.size).toBe(reasons.length);
  });

  it('tells hosts US numbers do not need +1', () => {
    expect(smsFailureMessage('invalid_phone')).toEqual(expect.objectContaining({ status: 400 }));
    expect(smsFailureMessage('invalid_phone').error).toContain('781-555-0123');
  });

  it('uses 409 for opted-out numbers and 503 when SMS is off', () => {
    expect(smsFailureMessage('opted_out').status).toBe(409);
    expect(smsFailureMessage('sms_disabled').status).toBe(503);
  });
});
