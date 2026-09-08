import { describe, expect, it } from 'vitest';
import { getGuestMessagingReadiness, normalizeSmsPhone } from '@/lib/guest/messaging-readiness';
import { ids, messagingDb, messagingSeed, readyGuestRow } from './helpers/messaging-db';

describe('guest direct messaging readiness', () => {
  const scope = { sessionId: ids.session, stayId: ids.stay, propertyId: ids.property };
  it('accepts an explicitly consented, phone-verified browser session without hardware detection', async () => {
    expect(await getGuestMessagingReadiness(messagingDb(messagingSeed()) as never, scope))
      .toMatchObject({ ready: true, contact: '+15005550006' });
  });
  it.each([
    { guest_contact: null }, { guest_contact: '5551234' }, { guest_contact: 'test@example.test' },
    { notification_consent: false }, { phone_verified_at: null }, { terms_accepted_at: null },
    { registered_at: null }, { revoked_at: '2026-09-01' }, { status: 'pending' },
    { expires_at: '2020-01-01' }, { expires_at: 'invalid' }, { sms_opted_out_at: '2026-09-01' },
    { property_id: 'another-property' }, { stay_id: 'another-stay' },
  ])('fails closed for %j', async (patch) => {
    const db = messagingDb({ ...messagingSeed(), guest_access_sessions: [readyGuestRow(patch)] });
    expect((await getGuestMessagingReadiness(db as never, scope)).ready).toBe(false);
  });
  it('never borrows the booking contact or another party member consent', async () => {
    const seed = messagingSeed();
    seed.guest_access_sessions = [readyGuestRow({ guest_contact: null }), readyGuestRow({ id: 'other-party' })];
    expect((await getGuestMessagingReadiness(messagingDb(seed) as never, scope)).ready).toBe(false);
  });
  it('cannot send after a stay is revoked', async () => {
    const seed = messagingSeed();
    seed.stays[0].status = 'revoked';
    expect((await getGuestMessagingReadiness(messagingDb(seed) as never, scope)).ready).toBe(false);
  });
  it('normalizes only unambiguous international numbers', () => {
    expect(normalizeSmsPhone('+1 (500) 555-0006')).toBe('+15005550006');
    for (const phone of ['5005550006', '+0123456789', 'text +15005550006', '+1+5005550006', '+1234567890123456']) {
      expect(normalizeSmsPhone(phone)).toBeNull();
    }
  });
});
