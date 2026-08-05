import { describe, it, expect } from 'vitest';
import { signupSchema } from './validation';

const base = {
  email: 'host@example.com',
  password: 'a-strong-passphrase',
  fullName: 'Test Host',
  acceptTerms: true as const,
};

describe('signupSchema SMS opt-in', () => {
  it('allows signup without a phone number when SMS opt-in is not given', () => {
    expect(signupSchema.safeParse({ ...base, smsOptIn: false }).success).toBe(true);
  });

  it('requires a usable mobile number when SMS opt-in is checked', () => {
    const res = signupSchema.safeParse({ ...base, smsOptIn: true, phone: '' });
    expect(res.success).toBe(false);
  });

  it('accepts an opt-in with a valid mobile number', () => {
    const res = signupSchema.safeParse({ ...base, smsOptIn: true, phone: '+1 (555) 123-4567' });
    expect(res.success).toBe(true);
  });
});
