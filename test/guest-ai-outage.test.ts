import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  answer: vi.fn(), escalationInserts: vi.fn(), notify: vi.fn(),
}));
const property = { id: 'property-1', slug: 'demo', display_name: 'Synthetic Demo', host_account_id: 'host-1' };
vi.mock('@/lib/guest/session', () => ({
  getGuestSession: async () => ({ propertyId: 'property-1', stayId: 'stay-1', sessionId: 'session-1', guestDisplayName: 'Test Guest' }),
}));
vi.mock('@/lib/guest/concierge', () => ({ answerGuestQuestion: mocks.answer }));
vi.mock('@/lib/billing/entitlements', () => ({ isGuestAiEnabled: async () => true }));
vi.mock('@/lib/guest/maintenance', () => ({ maybeCreateServiceRequest: async () => ({ created: false, guestLine: null }) }));
vi.mock('@/lib/guest/translate', () => ({
  translateForHost: async (text: string) => ({ text, translated: null, targetLabel: null }),
  notificationBody: () => 'A guest question needs your input',
}));
vi.mock('@/lib/guest/languages', () => ({ resolveLanguage: () => null, DEFAULT_HOST_LANGUAGE: 'en' }));
vi.mock('@/lib/guest/behavioral-triggers', () => ({ behavioralEscalation: () => ({ escalate: false, trigger: null }) }));
vi.mock('@/lib/ai/fallback', () => ({ fallbackClassifyIntent: () => 'information' }));
vi.mock('@/lib/notify', () => ({ notify: mocks.notify }));
vi.mock('@/lib/crypto', () => ({ signEscalationLinkToken: () => 'synthetic-token' }));
vi.mock('@/lib/env', () => ({ publicEnv: { appUrl: 'https://example.test' } }));
vi.mock('@/lib/posthog-server', () => ({ capture: async () => {} }));
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), info: vi.fn() } }));

const client = {
  from(table: string) {
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      insert: (value: unknown) => { if (table === 'escalations') mocks.escalationInserts(value); return q; },
      update: () => q,
      maybeSingle: async () => ({ data: table === 'properties' ? property
        : table === 'conversations' ? { id: 'conversation-1' }
        : table === 'guest_access_sessions' ? { guest_identity_id: null } : null }),
      single: async () => ({ data: { id: 'escalation-1' }, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    };
    return q;
  },
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));
import { POST } from '@/app/api/guest/[slug]/chat/route';

beforeEach(() => { vi.clearAllMocks(); });
describe('guest AI outage', () => {
  it('does not return a 500 or invented property answer when retrieval rejects', async () => {
    mocks.answer.mockRejectedValue(new Error('Embedding request failed: 401'));
    const req = new Request('https://example.test/api/guest/demo/chat', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Where is parking?' }) });
    const response = await POST(req, { params: Promise.resolve({ slug: 'demo' }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.escalated).toBe(true);
    expect(body.answer).toMatch(/host/);
    expect(body.answer).not.toContain('Embedding request failed');
    expect(mocks.escalationInserts).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
});
