import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({ requirePropertyAccess: async () => ({ can: { editBrain: true } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/ai/usage', () => ({ logAiUsage: vi.fn() }));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: mocks.route }));
import { improveBrainDraftAction } from '@/app/dashboard/properties/[id]/brain/add/improve-action';
function form(body: string) {
  const f = new FormData();
  f.set('propertyId', 'test-property'); f.set('title', 'Wi-Fi'); f.set('body', body);
  return f;
}
beforeEach(() => vi.clearAllMocks());
describe('Wi-Fi draft improvement', () => {
  it('rejects credentials without sending them to the model or inventing a location', async () => {
    mocks.route.mockResolvedValue({ text: 'The password is on the fridge.', model: 'strong' });
    const result = await improveBrainDraftAction({}, form('Wi-Fi password: Secret987!'));
    expect(result.error).toMatch(/location|credential/i);
    expect(mocks.route).not.toHaveBeenCalled();
  });
  it('rejects a rewrite that invents a password location', async () => {
    mocks.route.mockResolvedValue({ text: 'The Wi-Fi password is on the fridge.', model: 'strong' });
    const result = await improveBrainDraftAction({}, form('There is guest Wi-Fi available.'));
    expect(result.ok).not.toBe(true);
  });
  it('rejects credentials embedded in prose returned by the model', async () => {
    mocks.route.mockResolvedValue({ text: 'Use the guest network. Its password is Secret987! Enjoy your stay.', model: 'strong' });
    const result = await improveBrainDraftAction({}, form('The Wi-Fi password is on the welcome card in the study.'));
    expect(result.error).toMatch(/credential/i);
  });
});
