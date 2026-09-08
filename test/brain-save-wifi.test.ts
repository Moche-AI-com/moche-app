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
beforeEach(() => { vi.clearAllMocks(); mocks.client.mockImplementation(() => { throw new Error('Must reject before persistence'); }); });
describe('manual Wi-Fi input boundary', () => {
  it.each([
    ['Wi-Fi password', 'Secret987!'],
    ['Wi-Fi password location', 'Secret987!'],
    ['Wi-Fi connection instructions', 'Join the guest network using password: Secret987!'],
    ['Wi-Fi password location', 'On the router sticker (SyntheticPass2026!).'],
    ['Wi-Fi connection instructions', 'Use the router sticker (SyntheticPass2026!).'],
  ])('rejects credential entry in %s', async (title, body) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ title, body, propertyId: 'property', section: 'connectivity', visibility: 'guest' })) form.set(key, value);
    const result = await saveBrainItemAction({}, form);
    expect(result.error).toMatch(/password|credential|location/i);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(['', 'existing-item'])('preserves an explicit host save (itemId=%s)', async (itemId) => {
    const query = {
      insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'new-item' }, error: null }),
    };
    const client = { from: vi.fn(() => query) };
    mocks.client.mockReturnValue(client);
    mocks.embed.mockResolvedValue([[0.1]]);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      itemId, title: 'Wi-Fi password location', body: 'On the welcome card in the study.',
      propertyId: 'property', section: 'connectivity', visibility: 'guest',
    })) form.set(key, value);
    expect(await saveBrainItemAction({}, form)).toEqual({ ok: true });
    expect(client.from).toHaveBeenCalledWith('brain_items');
    expect(itemId ? query.update : query.insert).toHaveBeenCalledWith(expect.objectContaining({
      body: 'On the welcome card in the study.', status: 'ready', section: 'connectivity',
    }));
    if (itemId) {
      expect(query.eq).toHaveBeenCalledWith('id', itemId);
      expect(query.eq).toHaveBeenCalledWith('property_id', 'property');
    } else {
      expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
        property_id: 'property', source_type: 'manual_entry', created_by: 'host',
      }));
    }
  });
});
