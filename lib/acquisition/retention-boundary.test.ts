import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ first: vi.fn(), second: vi.fn(), third: vi.fn() }));
vi.mock('@/lib/net/ssrf', () => ({
  assertPublicUrl: async (url: string) => new URL(url), SsrfError: class extends Error {},
}));
vi.mock('@/lib/env', () => ({ serverEnv: { acquisitionShadowProvider: null } }));
vi.mock('./providers/firecrawl', () => ({
  firecrawlProvider: { name: 'first', supports: () => true, fetch: m.first },
}));
vi.mock('./providers/crawl4ai', () => ({
  crawl4aiProvider: { name: 'second', supports: () => true, fetch: m.second },
}));
vi.mock('./providers/static-http', () => ({
  staticHttpProvider: { name: 'third', supports: () => true, fetch: m.third },
}));
import { acquire } from './index';
import { SourceRetentionError } from './audit';

describe('acquisition retention boundary', () => {
  it('does not send to another provider after source retention fails', async () => {
    m.first.mockResolvedValue({ text: 'Reference text sufficient for a review.', title: 'Manual' });
    const onAttempt = vi.fn().mockRejectedValue(new SourceRetentionError());
    await expect(acquire('https://example.com/manual', 'manual_site_v1', { onAttempt }))
      .rejects.toThrow('source_retention_failed');
    expect(m.first).toHaveBeenCalledOnce();
    expect(m.second).not.toHaveBeenCalled();
    expect(m.third).not.toHaveBeenCalled();
    expect(onAttempt).toHaveBeenCalledOnce();
  });
});
