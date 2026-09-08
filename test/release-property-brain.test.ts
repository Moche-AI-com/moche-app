import { describe, expect, it, vi } from 'vitest';
import { releasePropertyBrain, MIGRATIONS } from '../scripts/release-property-brain.mjs';

const sha = 'a'.repeat(40);
const env: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_SHA: sha,
  EXPECTED_SHA: sha, SUPABASE_ACCESS_TOKEN: 'test-only-not-a-real-key',
};

describe('reviewed CI-only schema release', () => {
  it.each([
    { GITHUB_ACTIONS: 'false' }, { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { EXPECTED_SHA: 'b'.repeat(40) },
    { EXPECTED_SHA: '' }, { SUPABASE_ACCESS_TOKEN: '' },
  ])('refuses an unauthorized release before reading SQL or calling a provider (%j)', async (override) => {
    const fetcher = vi.fn();
    const read = vi.fn();
    await expect(releasePropertyBrain({ env: { ...env, ...override }, fetcher, read })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('submits only the fixed reviewed files in a verified transaction', async () => {
    const read = vi.fn().mockResolvedValue('BEGIN;\n-- fixture reviewed migration\nCOMMIT;');
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const result = await releasePropertyBrain({ env, read, fetcher, root: '/repo' });
    expect(read.mock.calls.map(([path]) => path)).toEqual(MIGRATIONS.map((path: string) => `/repo/${path}`));
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.supabase.com/v1/projects/sqpdzhannyskdiyuarhp/database/query');
    const body = JSON.parse(request.body);
    expect(body.read_only).toBe(false);
    expect(body.query).toMatch(/^BEGIN;/);
    expect(body.query).toContain('lock_timeout');
    expect(body.query).toContain('relrowsecurity');
    expect(body.query).toMatch(/COMMIT;$/);
    expect(body.query.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(body.query.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(result).toEqual({ project: 'sqpdzhannyskdiyuarhp', revision: sha, migrations: 2 });
    expect(JSON.stringify(result)).not.toContain(env.SUPABASE_ACCESS_TOKEN);
  });

  it('does not retry or expose provider response content on a failed apply', async () => {
    const text = vi.fn().mockResolvedValue('sensitive provider details');
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 403, text });
    await expect(releasePropertyBrain({ env, fetcher, read: vi.fn().mockResolvedValue('-- sql') }))
      .rejects.toThrow('HTTP 403');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
  });
});
