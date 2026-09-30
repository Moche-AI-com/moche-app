import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/lib/env', () => ({
  publicEnv: { appUrl: 'https://example.test' },
  serverEnv: { twilioAuthToken: 'synthetic-token', twilioAccountSid: 'ACsynthetic' },
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/notifications/deliveries', () => ({ updateDeliveryByProviderRef: mocks.update }));

import { POST } from '@/app/api/webhooks/twilio/status/route';
import { mapTwilioStatus, safeDashboardPath, shouldAdvanceStatus } from '@/lib/notifications/delivery-status';

const SID = 'SM' + 'a'.repeat(32);

function signed(body: Record<string, string>, valid = true) {
  const url = 'https://example.test/api/webhooks/twilio/status';
  const payload = url + Object.keys(body).sort().map((k) => k + body[k]).join('');
  const signature = createHmac('sha1', 'synthetic-token').update(payload).digest('base64');
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': valid ? signature : 'forged' },
    body: new URLSearchParams(body),
  });
}

const delivered = { AccountSid: 'ACsynthetic', MessageSid: SID, MessageStatus: 'delivered' };

describe('twilio status callback', () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue('updated');
  });

  it('rejects forged signatures without any writes', async () => {
    const res = await POST(signed(delivered, false));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a foreign AccountSid even when signed', async () => {
    const res = await POST(signed({ ...delivered, AccountSid: 'ACother' }));
    expect(res.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('records delivered status by Twilio SID', async () => {
    const res = await POST(signed(delivered));
    expect(res.status).toBe(204);
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), SID, 'delivered', null);
  });

  it('records undelivered with the Twilio error code as reason', async () => {
    await POST(signed({ ...delivered, MessageStatus: 'undelivered', ErrorCode: '30007' }));
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), SID, 'failed', 'twilio_30007');
  });

  it('ignores queued/accepted and malformed SIDs', async () => {
    expect((await POST(signed({ ...delivered, MessageStatus: 'queued' }))).status).toBe(204);
    expect((await POST(signed({ ...delivered, MessageSid: 'not-a-sid' }))).status).toBe(204);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('asks Twilio to retry when the database write fails', async () => {
    mocks.update.mockResolvedValue('error');
    expect((await POST(signed(delivered))).status).toBe(500);
  });
});

describe('delivery status helpers', () => {
  it('never downgrades a terminal status', () => {
    expect(shouldAdvanceStatus('queued', 'sent')).toBe(true);
    expect(shouldAdvanceStatus('sent', 'delivered')).toBe(true);
    expect(shouldAdvanceStatus('delivered', 'sent')).toBe(false);
    expect(shouldAdvanceStatus('delivered', 'failed')).toBe(false);
    expect(shouldAdvanceStatus('failed', 'delivered')).toBe(false);
  });

  it('maps Twilio statuses', () => {
    expect(mapTwilioStatus('sent', null)).toEqual({ status: 'sent', reason: null });
    expect(mapTwilioStatus('failed', 'abc')).toEqual({ status: 'failed', reason: 'twilio_failed' });
    expect(mapTwilioStatus('accepted', null)).toBeNull();
  });

  it('only redirects to dashboard paths', () => {
    expect(safeDashboardPath('/dashboard/escalations/1')).toBe('/dashboard/escalations/1');
    expect(safeDashboardPath('/dashboard?x=1')).toBe('/dashboard?x=1');
    expect(safeDashboardPath('https://evil.test/dashboard')).toBe('/dashboard');
    expect(safeDashboardPath('//evil.test')).toBe('/dashboard');
    expect(safeDashboardPath('/dashboardevil')).toBe('/dashboard');
    expect(safeDashboardPath('/dashboard/\\evil')).toBe('/dashboard');
    expect(safeDashboardPath(null)).toBe('/dashboard');
  });
});
