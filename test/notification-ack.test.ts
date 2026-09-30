import { describe, expect, it, vi } from 'vitest';
import { ids, messagingDb } from './helpers/messaging-db';

vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { acknowledgeNotification } from '@/lib/notifications/deliveries';
import { appRouteUrl, conversationIdFromLink } from '@/lib/notifications/delivery-status';

const N1 = '90000000-0000-4000-8000-000000000001';
const N2 = '90000000-0000-4000-8000-000000000002';
const row = (overrides: Record<string, unknown> = {}) => ({
  id: N1, host_account_id: ids.account, recipient_profile_id: ids.owner, conversation_id: null,
  link: '/dashboard/escalations/x', acknowledged_at: null, acknowledged_by: null, read_at: null, ...overrides,
});

describe('acknowledgeNotification', () => {
  it("acknowledges the recipient's own notification and returns its link", async () => {
    const db = messagingDb({ notifications: [row()] });
    expect(await acknowledgeNotification(db as never, { notificationId: N1, profileId: ids.owner })).toEqual({ link: '/dashboard/escalations/x' });
    expect(db.rows.notifications[0].acknowledged_by).toBe(ids.owner);
    expect(db.rows.notifications[0].acknowledged_at).toBeTruthy();
    expect(db.rows.notifications[0].read_at).toBeTruthy();
  });

  it('refuses a different profile and changes nothing', async () => {
    const db = messagingDb({ notifications: [row()] });
    expect(await acknowledgeNotification(db as never, { notificationId: N1, profileId: 'someone-else', accountId: ids.account })).toBeNull();
    expect(db.rows.notifications[0].acknowledged_at).toBeNull();
  });

  it('lets a member of the owning account acknowledge an account-wide notification', async () => {
    const db = messagingDb({ notifications: [row({ recipient_profile_id: null })] });
    expect(await acknowledgeNotification(db as never, { notificationId: N1, profileId: ids.owner, accountId: ids.account })).toEqual({ link: '/dashboard/escalations/x' });
    expect(db.rows.notifications[0].acknowledged_by).toBe(ids.owner);
  });

  it('refuses an account-wide notification from another account', async () => {
    const db = messagingDb({ notifications: [row({ recipient_profile_id: null })] });
    expect(await acknowledgeNotification(db as never, { notificationId: N1, profileId: ids.owner, accountId: 'other-account' })).toBeNull();
    expect(db.rows.notifications[0].acknowledged_at).toBeNull();
  });

  it('acknowledges the rest of that conversation for the same recipient', async () => {
    const db = messagingDb({ notifications: [
      row({ conversation_id: ids.conversation }),
      row({ id: N2, conversation_id: ids.conversation }),
    ] });
    await acknowledgeNotification(db as never, { notificationId: N1, profileId: ids.owner });
    expect(db.rows.notifications.every((n: any) => n.acknowledged_at)).toBe(true);
  });
});

describe('link helpers', () => {
  it('reads the conversation id from a host deep link', () => {
    expect(conversationIdFromLink(`/dashboard/properties/${ids.property}/stays/${ids.stay}/conversations/${ids.conversation}?message=${ids.message}`)).toBe(ids.conversation);
    expect(conversationIdFromLink('/dashboard/escalations/abc')).toBeNull();
    expect(conversationIdFromLink(null)).toBeNull();
  });

  it('builds HTTPS app routes only', () => {
    expect(appRouteUrl('https://example.test', '/api/webhooks/twilio/status')).toBe('https://example.test/api/webhooks/twilio/status');
    expect(appRouteUrl('http://example.test', '/x')).toBeNull();
    expect(appRouteUrl('not a url', '/x')).toBeNull();
  });
});
