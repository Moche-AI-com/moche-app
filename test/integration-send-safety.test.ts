import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  failure: '' as '' | 'update' | 'insert' | 'throw',
  matched: true,
  signupFails: false,
  otp: vi.fn(),
  thanks: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  operations: [] as string[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasServiceRole: () => true,
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'early_access_signups') {
        return { insert: async () => ({ error: state.signupFails ? { message: 'synthetic-private' } : null }) };
      }
      let operation = 'select';
      const query = {
        select: () => query, eq: () => query, is: () => query,
        gte: () => query, in: () => query, order: () => query,
        maybeSingle: () => query,
        update: () => { operation = 'update'; return query; },
        insert: () => { operation = 'insert'; return query; },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          state.operations.push(`${table}:${operation}`);
          if (table === 'guest_verifications' && operation !== 'select') {
            if (state.failure === 'throw') return Promise.reject(new Error('synthetic-private')).then(resolve, reject);
            return Promise.resolve({ error: state.failure === operation ? { message: 'synthetic-private' } : null }).then(resolve, reject);
          }
          const data = table === 'properties' ? { id: 'property-test', status: 'live' }
            : table === 'stays' && state.matched ? { id: 'stay-test' } : null;
          return Promise.resolve({ data, count: 0, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/crypto', () => ({
  hashContact: () => ({ contactHash: 'synthetic-contact-hash' }),
  generateOtp: () => '000000',
  hashOtp: () => 'synthetic-code-hash',
}));
vi.mock('@/lib/guest/turnstile', () => ({ verifyTurnstile: async () => true }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/env', () => ({ serverEnv: { guestVerifyDevFallback: false } }));
vi.mock('@/lib/log', () => ({ log: { warn: state.warn, error: state.error } }));
vi.mock('@/lib/notify', () => ({ notifyGuestOtp: state.otp }));
vi.mock('@/lib/mail/early-access', () => ({ sendEarlyAccessThanks: state.thanks }));

import { POST as verify } from '@/app/api/guest/[slug]/verify/start/route';
import { POST as waitlist } from '@/app/api/waitlist/route';

const request = () => new NextRequest('https://example.test/api', {
  method: 'POST', body: JSON.stringify({ contact: 'guest@example.test', email: 'guest@example.test' }),
});
const verifyRequest = () => verify(request(), { params: Promise.resolve({ slug: 'synthetic-property' }) });

beforeEach(() => {
  vi.clearAllMocks();
  state.failure = ''; state.matched = true; state.signupFails = false; state.operations = [];
  state.otp.mockResolvedValue(undefined);
  state.thanks.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network'); }));
});

it.each(['update', 'insert', 'throw'] as const)('does not send after OTP persistence failure: %s', async (failure) => {
  state.matched = false;
  const unmatched = await (await verifyRequest()).json();
  state.matched = true;
  state.failure = failure;
  const response = await verifyRequest();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(unmatched);
  expect(state.otp).not.toHaveBeenCalled();
  expect(JSON.stringify(state.warn.mock.calls)).not.toContain('synthetic-private');
  expect(fetch).not.toHaveBeenCalled();
});

it('persists the OTP before sending and hides a delivery exception', async () => {
  state.otp.mockImplementation(async () => {
    expect(state.operations).toContain('guest_verifications:update');
    expect(state.operations).toContain('guest_verifications:insert');
    throw new Error('synthetic-private');
  });
  const response = await verifyRequest();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true });
  expect(state.otp).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(state.warn.mock.calls)).not.toContain('synthetic-private');
});

it('keeps the waitlist request alive until the best-effort send settles', async () => {
  let finish!: (sent: boolean) => void;
  state.thanks.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
  let settled = false;
  const response = waitlist(request()).then((value) => { settled = true; return value; });
  await vi.waitFor(() => expect(state.thanks).toHaveBeenCalledTimes(1));
  expect(settled).toBe(false);
  finish(false);
  expect(await (await response).json()).toEqual({ ok: true });
});

it('does not email a failed waitlist insert or log its raw error', async () => {
  state.signupFails = true;
  expect(await (await waitlist(request())).json()).toEqual({ ok: true });
  expect(state.thanks).not.toHaveBeenCalled();
  expect(state.error).toHaveBeenCalledWith('early_access_insert_failed', {});
});
