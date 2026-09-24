import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn(), embed: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requirePropertyAccess: async () => ({ can: { editBrain: true }, property: { host_account_id: 'host' } }),
  requireSession: async () => ({ user: { id: 'host' } }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.client }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/normalizer', () => ({ upsertNormalizedNode: vi.fn() }));
vi.mock('@/lib/ai', () => ({ getAIProvider: () => ({ embed: mocks.embed }) }));
vi.mock('@/lib/brain/cache', () => ({ bumpBrainVersion: vi.fn() }));
import { saveBrainItemAction } from '@/app/dashboard/properties/[id]/brain/actions';

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'new-item' }, error: null }),
  };
  mocks.client.mockReturnValue({ from: vi.fn(() => query) });
});

describe('Brain indexing failure', () => {
  it('reports a saved but unindexed item when embedding returns 401', async () => {
    mocks.embed.mockRejectedValue(new Error('Embedding request failed: 401'));
    const form = new FormData();
    for (const [key, value] of Object.entries({
      title: 'Wi-Fi password location', body: 'On the welcome card in the study.',
      propertyId: 'property', section: 'connectivity', visibility: 'guest',
    })) form.set(key, value);
    const result = await saveBrainItemAction({}, form);
    expect(result.ok).not.toBe(true);
    expect(result.error).toMatch(/saved, but AI indexing failed/i);
    expect(mocks.embed).toHaveBeenCalled();
  });
});
