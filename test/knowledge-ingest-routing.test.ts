import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  access: vi.fn(), source: vi.fn(), acquire: vi.fn(), cleanup: vi.fn(),
  proposal: vi.fn(), record: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/auth/guards', () => ({
  getPropertyAccess: m.access, getSessionContext: vi.fn(async () => ({ user: { id: 'host' } })),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/acquisition', () => ({
  acquire: m.acquire, AcquisitionError: class extends Error { reason = 'unreachable'; },
}));
vi.mock('@/lib/acquisition/audit', () => ({
  ensureIngestionSource: m.source, recordManualSource: m.record, acquisitionAuditContext: () => ({}),
}));
vi.mock('@/lib/ingest/standardize', () => ({
  standardizeListing: m.cleanup, standardizeKnowledge: m.cleanup,
}));
vi.mock('@/lib/brain/proposal-store', () => ({ createProposal: m.proposal }));
vi.mock('@/lib/audit', () => ({ audit: m.audit }));
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn() } }));

import { POST as urlPost } from '@/app/api/properties/[id]/ingest/url/route';
import { POST as textPost } from '@/app/api/properties/[id]/ingest/text/route';

const text = 'Disconnect power before cleaning. Do not remove the safety guard.';
const params = { params: Promise.resolve({ id: 'property' }) };
function req(body: object) {
  return new Request('https://example.com/api/ingest', { method: 'POST', body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.record.mockResolvedValue(undefined);
  m.access.mockResolvedValue({ can: { editBrain: true }, property: { host_account_id: 'account' } });
  m.source.mockResolvedValue('source');
  m.acquire.mockResolvedValue({ text, finalUrl: 'https://example.com/manual', title: 'Manual' });
  m.cleanup.mockResolvedValue({ text, standardized: false, truncated: false });
  m.proposal.mockResolvedValue({ ok: true, id: 'pending-proposal' });
});

describe('knowledge acquisition uses explicit source categories', () => {
  it.each([
    ['appliances', 'manual_site_v1', 'manual_site'],
    ['product_urls', 'manual_site_v1', 'manual_site'],
    ['documents', 'manual_site_v1', 'manual_site'],
    ['local_recommendations', 'local_source_v1', 'local_source'],
  ])('%s uses %s and never publishes before review', async (category, profile, kind) => {
    const response = await urlPost(req({ url: 'https://example.com/manual', category }), params);
    expect(response.status).toBe(200);
    expect(m.acquire).toHaveBeenCalledWith('https://example.com/manual', profile, expect.any(Object));
    expect(m.source).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ profile, kind }));
    expect(m.cleanup).toHaveBeenCalledWith(text, category, 'https://example.com/manual');
    expect(m.proposal).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      fieldPath: 'brain.document_summary', confidence: 0.4,
      proposedValue: expect.objectContaining({ category, text }),
    }));
    expect(await response.json()).toMatchObject({ queued: true, standardized: false });
  });

  it('reports a lower-confidence raw paste when requested AI cleanup fails', async () => {
    const response = await textPost(req({ text, category: 'appliances' }), params);
    expect(m.cleanup).toHaveBeenCalledWith(text, 'appliances');
    expect(m.proposal).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ confidence: 0.4 }));
    expect(await response.json()).toMatchObject({
      queued: true, standardized: false, message: expect.stringMatching(/original/i),
    });
  });

  it('reports successful cleanup without auto-approving it', async () => {
    m.cleanup.mockResolvedValue({ text, standardized: true, truncated: false });
    const response = await textPost(req({ text, category: 'house_rules' }), params);
    expect(m.proposal).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ confidence: 0.8 }));
    expect(await response.json()).toMatchObject({ queued: true, standardized: true });
  });

  it('warns explicitly when the review draft is clipped', async () => {
    m.cleanup.mockResolvedValue({ text, standardized: false, truncated: true });
    const response = await textPost(req({ text }), params);
    expect(await response.json()).toMatchObject({ truncated: true, message: expect.stringMatching(/split/i) });
  });

  it('does not queue or claim a saved source when original retention fails', async () => {
    m.record.mockRejectedValue(new Error('private retention canary'));
    const response = await textPost(req({ text: 'A'.repeat(24000) }), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Could not save the original source. Keep your text and try again.',
    });
    expect(m.cleanup).not.toHaveBeenCalled();
    expect(m.proposal).not.toHaveBeenCalled();
  });

  it('does not acquire, spend on AI, or queue for an unassigned property', async () => {
    m.access.mockResolvedValue(null);
    expect((await urlPost(req({ url: 'https://example.com/manual' }), params)).status).toBe(404);
    expect(m.acquire).not.toHaveBeenCalled();
    expect(m.cleanup).not.toHaveBeenCalled();
    expect(m.proposal).not.toHaveBeenCalled();
  });
});
