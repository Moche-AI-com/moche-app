import { describe, it, expect } from 'vitest';
import { checkRateLimit } from './rate-limit';

// Minimal fake of the Supabase query-builder chain used by checkRateLimit:
//   from('audit_logs').select('id',{count,head}).eq().eq().gte()  -> { count, error }
//   from('audit_logs').insert({...})                              -> { error }
function fakeAdmin(opts: { count: number; countError?: { message: string }; inserts: unknown[] }) {
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
          return Promise.resolve({ error: null });
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
    expect(res.remaining).toBe(2); // 5 - 2 - 1
    expect(res.retryAfterSeconds).toBe(0);
    expect(inserts).toHaveLength(1); // event recorded
  });

  it('rejects without recording when at the limit', async () => {
    const inserts: unknown[] = [];
    const res = await checkRateLimit(fakeAdmin({ count: 5, inserts }), {
      key: '1.2.3.4', limit: 5, windowSeconds: 3600, action: 'test',
    });
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.retryAfterSeconds).toBe(3600);
    expect(inserts).toHaveLength(0); // no event recorded on rejection
  });

  it('does not store the raw key (it is hashed)', async () => {
    const inserts: Array<{ ip_hash: string }> = [];
    await checkRateLimit(fakeAdmin({ count: 0, inserts: inserts as unknown[] }), {
      key: 'raw-secret-key', limit: 5, windowSeconds: 60, action: 'test',
    });
    expect(inserts[0].ip_hash).not.toContain('raw-secret-key');
    expect(inserts[0].ip_hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it('fails open on a counter read error', async () => {
    const inserts: unknown[] = [];
    const res = await checkRateLimit(
      fakeAdmin({ count: 0, countError: { message: 'db down' }, inserts }),
      { key: 'x', limit: 5, windowSeconds: 60, action: 'test' },
    );
    expect(res.allowed).toBe(true);
    expect(inserts).toHaveLength(0); // no insert attempted on read error
  });
});
