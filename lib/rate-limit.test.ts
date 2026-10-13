import { describe, it, expect } from 'vitest';
import { checkRateLimit } from './rate-limit';

function fakeAdmin(opts: { count: number; countError?: { message: string }; insertError?: { message: string }; inserts: unknown[] }) {
  const selectChain = {
    eq() { return this; },
    gte() { return Promise.resolve({ count: opts.count, error: opts.countError ?? null }); },
  };
  return {
    from() {
      return {
        select: () => selectChain,
        insert: (row: unknown) => {
          opts.inserts.push(row);
          return Promise.resolve({ error: opts.insertError ?? null });
        },
      };
    },
  } as never;
}

describe('checkRateLimit', () => {
  it('allows and records when under the limit', async () => {
    const inserts: unknown[] = [];
    const res = await checkRateLimit(fakeAdmin({ count: 2, inserts }), {
      key: '1.2.3.4', limit: 5, windowSeconds: 3600, action: 'test',
    });
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(2);
    expect(res.retryAfterSeconds).toBe(0);
    expect(inserts).toHaveLength(1);
  });
  it('rejects without recording when at the limit', async () => {
    const inserts: unknown[] = [];
    const res = await checkRateLimit(fakeAdmin({ count: 5, inserts }), {
      key: '1.2.3.4', limit: 5, windowSeconds: 3600, action: 'test',
    });
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.retryAfterSeconds).toBe(3600);
    expect(inserts).toHaveLength(0);
  });
  it('hashes the subject key before storage', async () => {
    const inserts: Array<{ ip_hash: string }> = [];
    await checkRateLimit(fakeAdmin({ count: 0, inserts: inserts as unknown[] }), {
      key: 'raw-secret-key', limit: 5, windowSeconds: 60, action: 'test',
    });
    expect(inserts[0].ip_hash).not.toContain('raw-secret-key');
    expect(inserts[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('preserves fail-open behavior for existing callers', async () => {
    const inserts: unknown[] = [];
    const res = await checkRateLimit(fakeAdmin({ count: 0, countError: { message: 'db down' }, inserts }),
      { key: 'x', limit: 5, windowSeconds: 60, action: 'test' });
    expect(res.allowed).toBe(true);
    expect(inserts).toHaveLength(0);
  });
  it('fails closed on counter or audit-write failure for a paid provider', async () => {
    const countFailure = await checkRateLimit(fakeAdmin({ count: 0, countError: { message: 'db down' }, inserts: [] }),
      { key: 'x', limit: 5, windowSeconds: 60, action: 'mapbox_search', failClosed: true });
    expect(countFailure.allowed).toBe(false);
    const inserts: unknown[] = [];
    const writeFailure = await checkRateLimit(fakeAdmin({ count: 0, insertError: { message: 'db down' }, inserts }),
      { key: 'x', limit: 5, windowSeconds: 60, action: 'mapbox_search', failClosed: true });
    expect(writeFailure.allowed).toBe(false);
    expect(inserts).toHaveLength(1);
  });
});
