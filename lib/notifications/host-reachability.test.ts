import { describe, expect, it } from 'vitest';
import { textAlertGap } from './host-reachability';

describe('textAlertGap', () => {
  it('reports the first missing step', () => {
    expect(textAlertGap({ phone: null, phone_verified_at: null, sms_opt_in: false })).toBe('no_phone');
    expect(textAlertGap({ phone: '+15005550006', phone_verified_at: null, sms_opt_in: true })).toBe('unverified');
    expect(textAlertGap({ phone: '+15005550006', phone_verified_at: '2026-09-01T00:00:00Z', sms_opt_in: false })).toBe('not_opted_in');
  });

  it('is null when the host can be texted', () => {
    expect(textAlertGap({ phone: '+15005550006', phone_verified_at: '2026-09-01T00:00:00Z', sms_opt_in: true })).toBeNull();
  });
});
