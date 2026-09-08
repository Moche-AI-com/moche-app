import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each([
  ['production', 'production', 'true', true],
  ['production', 'production', '1', true],
  ['production', 'production', '', false],
  ['production', 'production', 'false', false],
  ['production', 'preview', 'true', false],
  ['test', 'production', 'true', false],
  ['development', '', 'true', false],
])('SMS delivery guard: %s / %s / %s => %s', async (node, vercel, enabled, expected) => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', node);
  vi.stubEnv('VERCEL_ENV', vercel);
  vi.stubEnv('NOTIFY_SMS_ENABLED', enabled);
  const { serverEnv } = await import('./env');
  expect((serverEnv as typeof serverEnv & { smsDeliveryEnabled?: boolean }).smsDeliveryEnabled).toBe(expected);
});
