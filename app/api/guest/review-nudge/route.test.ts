import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: { sessionId: 'session-1', propertyId: 'property-1', stayId: 'stay-1', guestDisplayName: 'Test', checkOut: '2099-01-01' } as any,
  flag: null as unknown, paid: true, demo: false, allowed: true,
  rpc: vi.fn(), eq: vi.fn(), legacyGet: vi.fn(), legacyPost: vi.fn(), warn: vi.fn(), demoCheck: vi.fn(),
}));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: async () => state.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  from: (table: string) => {
    const q = { select: () => q, eq: (...args: unknown[]) => { state.eq(table, ...args); return q; }, maybeSingle: async () => table === 'app_settings'
      ? { data: { value: state.flag }, error: null }
      : { data: { host_account_id: 'account-1', status: 'live', deleted_at: null }, error: null } };
    return q;
  }, rpc: state.rpc,
}) }));
vi.mock('@/lib/billing/entitlements', () => ({ getEntitlements: async () => ({ reviewNudge: state.paid }), isGuestAiEnabled: (...args: unknown[]) => state.demoCheck(...args) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: state.allowed }) }));
vi.mock('@/lib/log', () => ({ log: { warn: state.warn } }));
vi.mock('./legacy', () => ({ GET: (...args: unknown[]) => state.legacyGet(...args), POST: (...args: unknown[]) => state.legacyPost(...args) }));
import { GET, POST } from './route';
const request = (body: unknown, origin = 'https://www.moche-ai.com') => new Request('https://www.moche-ai.com/api/guest/review-nudge', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('REVIEW_NUDGE_V2_ENABLED', '');
  state.session = { sessionId: 'session-1', propertyId: 'property-1', stayId: 'stay-1', guestDisplayName: 'Test', checkOut: '2099-01-01' };
  state.flag = null; state.paid = true; state.demo = false; state.allowed = true;
  state.demoCheck.mockImplementation(async () => state.demo);
  state.rpc.mockResolvedValue({ data: { eligible: true, ok: true, reviewUrl: 'https://www.moche-ai.com/review-demo' }, error: null });
  state.legacyGet.mockImplementation(async () => new Response(JSON.stringify({ eligible: false })));
  state.legacyPost.mockImplementation(async (req: Request) => new Response(JSON.stringify({ ok: (await req.json()).mood === 'great' })));
});
afterEach(() => vi.unstubAllEnvs());
describe('Review Nudge pilot routing', () => {
  it('preserves legacy GET for an unconfigured property', async () => {
    const res = await GET(); expect(res.status).toBe(200); expect((await res.json()).flowVersion).toBe('legacy'); expect(state.legacyGet).toHaveBeenCalledOnce(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('forwards a legacy POST without consuming its body', async () => {
    const res = await POST(request({ action: 'response', mood: 'great' })); expect((await res.json()).ok).toBe(true); expect(state.legacyPost).toHaveBeenCalledOnce(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('scopes rollout to the authenticated property and RPC to its session', async () => {
    state.flag = { enabled: true }; const res = await GET(); expect(res.status).toBe(200); expect((await res.json()).flowVersion).toBe('v2');
    expect(state.eq).toHaveBeenCalledWith('app_settings', 'key', 'review_nudge_v2:property-1');
    expect(state.rpc).toHaveBeenCalledWith('guest_review_nudge_v2', { p_session_id: 'session-1', p_action: 'status', p_automatic: false, p_rating: null, p_helpfulness: null, p_comment: null });
  });
  it('allows only an explicitly permitted existing demo grant', async () => {
    state.flag = { enabled: true, allow_demo: true, demo_review: true }; state.paid = false; state.demo = true;
    const res = await GET(); expect(res.status).toBe(200); expect((await res.json()).demoReview).toBe(true); expect(state.demoCheck).toHaveBeenCalledWith(expect.anything(), 'account-1');
  });
  it('denies an absent demo grant even when the property flag permits demos', async () => {
    state.flag = { enabled: true, allow_demo: true }; state.paid = false;
    expect((await GET()).status).toBe(404); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('never treats demo AI access alone as a Review Nudge entitlement', async () => {
    state.flag = { enabled: true }; state.paid = false; state.demo = true;
    expect((await GET()).status).toBe(404); expect(state.demoCheck).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('requires an authenticated guest', async () => {
    state.session = null; expect((await GET()).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled(); expect(state.eq).not.toHaveBeenCalled();
  });
  it('supports a kill switch without activating an unconfigured cohort', async () => {
    state.flag = { enabled: true, allow_demo: true }; vi.stubEnv('REVIEW_NUDGE_V2_ENABLED', 'false');
    expect((await GET()).status).toBe(200); expect(state.legacyGet).toHaveBeenCalledOnce(); expect(state.rpc).not.toHaveBeenCalled();
  });
});
describe('v2 feedback boundary', () => {
  beforeEach(() => { state.flag = { enabled: true }; });
  it.each([0, 6, 2.5])('rejects invalid rating %s', async (rating) => {
    expect((await POST(request({ action: 'response', rating }))).status).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('rejects browser-supplied property scope', async () => {
    expect((await POST(request({ action: 'response', rating: 5, propertyId: 'another-property' }))).status).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('rejects cross-origin submissions', async () => {
    expect((await POST(request({ action: 'response', rating: 5 }, 'https://another.example'))).status).toBe(403); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('does not claim success on a persistence error or leak comment text to logs', async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database detail' } });
    const res = await POST(request({ action: 'response', rating: 1, comment: 'Private test feedback' }));
    expect(res.status).toBe(503); expect((await res.json()).ok).toBeUndefined(); expect(state.warn).toHaveBeenCalledWith('guest_review_nudge_write_failed');
  });
  it('enforces the event rate limit', async () => {
    state.allowed = false; expect((await POST(request({ action: 'response', rating: 5 }))).status).toBe(429); expect(state.rpc).not.toHaveBeenCalled();
  });
});
