import { describe, it, expect } from 'vitest';
import { resolveTwilioAuth, type TwilioAuth } from './env';

type Slice = Parameters<typeof resolveTwilioAuth>[0] & object;

function slice(over: Partial<Slice>): Slice {
  return {
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioApiKeySid: '',
    twilioApiKeySecret: '',
    twilioFromNumber: '',
    ...over,
  } as Slice;
}

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('resolveTwilioAuth', () => {
  it('prefers API key SID/secret when present (mode=api_key)', () => {
    const auth = resolveTwilioAuth(
      slice({
        twilioAccountSid: 'AC123',
        twilioApiKeySid: 'SK999',
        twilioApiKeySecret: 'secret',
        twilioAuthToken: 'shouldBeIgnored',
        twilioFromNumber: '+15550001111',
      }),
    ) as TwilioAuth;
    expect(auth).not.toBeNull();
    expect(auth.mode).toBe('api_key');
    expect(auth.accountSid).toBe('AC123'); // account SID still in URL path
    expect(auth.authHeader).toBe(b64('SK999:secret'));
    expect(auth.fromNumber).toBe('+15550001111');
  });

  it('falls back to auth token when no API key (mode=auth_token)', () => {
    const auth = resolveTwilioAuth(
      slice({ twilioAccountSid: 'AC123', twilioAuthToken: 'tok', twilioFromNumber: '+15550001111' }),
    ) as TwilioAuth;
    expect(auth.mode).toBe('auth_token');
    expect(auth.authHeader).toBe(b64('AC123:tok'));
  });

  it('returns null when no credentials are present (SMS disabled)', () => {
    expect(resolveTwilioAuth(slice({ twilioAccountSid: 'AC123', twilioFromNumber: '+1555' }))).toBeNull();
  });

  it('returns null when the account SID is missing', () => {
    expect(resolveTwilioAuth(slice({ twilioAuthToken: 'tok', twilioFromNumber: '+1555' }))).toBeNull();
  });

  it('returns null when no From number is available', () => {
    expect(resolveTwilioAuth(slice({ twilioAccountSid: 'AC123', twilioAuthToken: 'tok' }))).toBeNull();
  });
});
