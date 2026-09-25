import { describe, expect, it } from 'vitest';
import { isGuestAiEnabled } from './entitlements';

type Client = Parameters<typeof isGuestAiEnabled>[0];
const demoKey = 'guest_ai_demo:demo-account';

function fakeClient(subscription: unknown, grants: Record<string, unknown> = {}, subscriptionError = false): Client {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, key: string) => ({
          maybeSingle: async () => table === 'subscriptions'
            ? { data: subscription, error: subscriptionError ? { message: 'database unavailable' } : null }
            : { data: Object.prototype.hasOwnProperty.call(grants, key) ? { value: grants[key] } : null, error: null },
        }),
      }),
    }),
  } as unknown as Client;
}

describe('account-scoped permanent demo guest AI', () => {
  it('enables only the account with an explicit service-only grant', async () => {
    const client = fakeClient(null, { [demoKey]: { enabled: true } });
    expect(await isGuestAiEnabled(client, 'demo-account')).toBe(true);
    expect(await isGuestAiEnabled(client, 'another-account')).toBe(false);
  });

  it('fails closed for missing, disabled, or malformed grants', async () => {
    expect(await isGuestAiEnabled(fakeClient(null), 'demo-account')).toBe(false);
    for (const value of [{ enabled: false }, { enabled: 'true' }, null, true]) {
      expect(await isGuestAiEnabled(fakeClient(null, { [demoKey]: value }), 'demo-account')).toBe(false);
    }
  });

  it('does not bypass a canceled or read-only subscription', async () => {
    const grants = { [demoKey]: { enabled: true } };
    expect(await isGuestAiEnabled(fakeClient({ status: 'canceled', is_read_only: false }, grants), 'demo-account')).toBe(false);
    expect(await isGuestAiEnabled(fakeClient({ status: 'active', is_read_only: true }, grants), 'demo-account')).toBe(false);
    expect(await isGuestAiEnabled(fakeClient({ status: 'active', is_read_only: false }, grants), 'demo-account')).toBe(true);
  });

  it('fails closed when the subscription query errors', async () => {
    expect(await isGuestAiEnabled(fakeClient(null, { [demoKey]: { enabled: true } }, true), 'demo-account')).toBe(false);
  });
});
