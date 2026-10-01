import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@trigger.dev/sdk', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { callAppCronRoute } from '../trigger/_shared/app-route';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.APP_URL = 'https://example.test';
  process.env.CRON_SECRET = 'synthetic-cron';
  delete process.env.NEXT_PUBLIC_APP_URL;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, due: 0 })));
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('callAppCronRoute', () => {
  it('POSTs to the app route with the bearer secret and returns the body', async () => {
    await expect(callAppCronRoute('/api/cron/x', 1000)).resolves.toEqual({ ok: true, due: 0 });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://example.test/api/cron/x'),
      expect.objectContaining({ method: 'POST', headers: { authorization: 'Bearer synthetic-cron' }, redirect: 'error' }),
    );
  });

  it('fails loudly when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET;
    await expect(callAppCronRoute('/api/cron/x', 1000)).rejects.toThrow(/CRON_SECRET missing/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a non-https APP_URL', async () => {
    process.env.APP_URL = 'http://example.test';
    await expect(callAppCronRoute('/api/cron/x', 1000)).rejects.toThrow(/APP_URL missing/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('explains a 404 as a secret mismatch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(callAppCronRoute('/api/cron/x', 1000)).rejects.toThrow(/does not match Vercel/);
  });

  it('fails on other non-2xx responses', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(callAppCronRoute('/api/cron/x', 1000)).rejects.toThrow(/failed with 500/);
  });

  it('explains network failures and redirects', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(callAppCronRoute('/api/cron/x', 1000)).rejects.toThrow(/could not reach the app/);
  });
});
