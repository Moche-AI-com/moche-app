import { afterEach, expect, it, vi } from 'vitest';
import { messagingDb } from './helpers/messaging-db';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => messagingDb({ sms_suppressions: [] }),
}));
vi.mock('@/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

async function configured(runtime: string, enabled: string) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL_ENV', runtime);
  vi.stubEnv('NOTIFY_SMS_ENABLED', enabled);
  vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACsynthetic');
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'synthetic-token');
  vi.stubEnv('TWILIO_PHONE_NUMBER', '+15005550006');
  vi.stubEnv('TWILIO_FROM_NUMBER', undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ sid: 'SMsynthetic', status: 'queued' }), { status: 201 }),
  ));
  // Deliberately use real lib/env.ts, not an invented mock-only setting.
  return import('@/lib/notify');
}

it('existing production SMS configuration actually reaches mocked Twilio', async () => {
  const { sendHostOtp } = await configured('production', 'true');
  expect(await sendHostOtp('+15005550006', '123456')).toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
});
it('real preview runtime cannot send with the same configured credentials', async () => {
  const { sendHostOtp } = await configured('preview', 'true');
  expect(await sendHostOtp('+15005550006', '123456')).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
it('the existing SMS master switch disables production sends', async () => {
  const { sendHostOtp } = await configured('production', 'false');
  expect(await sendHostOtp('+15005550006', '123456')).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});
