import { describe, it, expect, vi, beforeEach } from 'vitest';

// The host-preview sandbox routes (Property page → Preview Guest Portal). Every
// one of them must (a) refuse anyone without a host session + property access,
// and (b) perform zero writes — no inserts, updates, notifications, or captures.
// These tests pin both properties with mocked boundaries.

const requireSession = vi.fn();
const getPropertyAccess = vi.fn();

vi.mock('@/lib/auth/guards', () => ({
  requireSession: (...args: unknown[]) => requireSession(...args),
  getPropertyAccess: (...args: unknown[]) => getPropertyAccess(...args),
}));

const insertCalls: string[] = [];

// Chainable query-builder stub. Every read chain resolves to `row`; every write
// method records itself so tests can assert none happened.
function makeAdmin(row: unknown = null) {
  const builder: Record<string, unknown> = {};
  const self = new Proxy(builder, {
    get(_target, prop: string) {
      if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: row, error: null });
      if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') {
        return (...args: unknown[]) => {
          insertCalls.push(`${String(prop)}(${args.length})`);
          return self;
        };
      }
      if (prop === 'then') return undefined;
      return () => self;
    },
  });
  return { from: () => self };
}

let adminRow: unknown = null;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdmin(adminRow),
  hasServiceRole: () => true,
}));

const answerGuestQuestion = vi.fn();
vi.mock('@/lib/guest/concierge', () => ({
  answerGuestQuestion: (...args: unknown[]) => answerGuestQuestion(...args),
}));

const runSafetyTriage = vi.fn();
const runInterviewTurn = vi.fn();
vi.mock('@/lib/guest/service-request-interview', () => ({
  runSafetyTriage: (...args: unknown[]) => runSafetyTriage(...args),
  runInterviewTurn: (...args: unknown[]) => runInterviewTurn(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true }),
}));

import { POST as previewChat } from '@/app/api/host/properties/[id]/preview-chat/route';
import { POST as previewHostChat } from '@/app/api/host/properties/[id]/preview-host-chat/route';
import { POST as previewServiceRequest } from '@/app/api/host/properties/[id]/preview-service-request/route';
import { POST as previewExtrasRequest } from '@/app/api/host/properties/[id]/preview-extras-request/route';

const PARAMS = { params: Promise.resolve({ id: 'prop-1' }) };

function jsonReq(body: unknown) {
  return new Request('http://test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const cannedAnswer = {
  text: 'The Wi-Fi network is listed on the welcome card.',
  confidence: 0.9,
  intent: 'wifi',
  model: 'test-model',
  sources: [],
  shouldEscalate: false,
  isEmergency: false,
  suggestions: [],
  places: [],
  unknownNote: null,
};

beforeEach(() => {
  insertCalls.length = 0;
  adminRow = null;
  requireSession.mockReset();
  getPropertyAccess.mockReset();
  answerGuestQuestion.mockReset();
  runSafetyTriage.mockReset();
  runInterviewTurn.mockReset();
  requireSession.mockResolvedValue({ id: 'host-1' });
  getPropertyAccess.mockResolvedValue({ property: { id: 'prop-1', display_name: 'Cabin 12' }, can: {} });
});

describe('preview-chat', () => {
  it('rejects when there is no host session', async () => {
    requireSession.mockRejectedValue(new Error('unauthenticated'));
    await expect(previewChat(jsonReq({ message: 'wifi?' }), PARAMS)).rejects.toThrow('unauthenticated');
    expect(answerGuestQuestion).not.toHaveBeenCalled();
  });

  it('404s when the host has no access to the property', async () => {
    getPropertyAccess.mockResolvedValue(null);
    const res = await previewChat(jsonReq({ message: 'wifi?' }), PARAMS);
    expect(res.status).toBe(404);
    expect(answerGuestQuestion).not.toHaveBeenCalled();
  });

  it('answers through the real pipeline with persistence off and writes nothing', async () => {
    answerGuestQuestion.mockResolvedValue(cannedAnswer);
    const res = await previewChat(jsonReq({ message: 'What is the Wi-Fi?', language: 'en' }), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.answer).toBe(cannedAnswer.text);
    expect(json.escalated).toBe(false);
    // The sandbox contract: the concierge pipeline was told not to persist, and
    // the route itself performed no writes of any kind.
    expect(answerGuestQuestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ persist: false, source: 'host_preview' }),
    );
    expect(insertCalls).toEqual([]);
  });
});

describe('preview-host-chat', () => {
  it('404s without property access', async () => {
    getPropertyAccess.mockResolvedValue(null);
    const res = await previewHostChat(jsonReq({ message: 'hi' }), PARAMS);
    expect(res.status).toBe(404);
  });

  it('echoes the message in thread shape without writing anything', async () => {
    const res = await previewHostChat(jsonReq({ message: 'Is early check-in possible?' }), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message.role).toBe('guest');
    expect(json.message.content).toBe('Is early check-in possible?');
    expect(json.message.id).toMatch(/^preview-/);
    expect(insertCalls).toEqual([]);
  });
});

describe('preview-service-request', () => {
  it('runs safety triage exactly like the guest route, without persisting', async () => {
    runSafetyTriage.mockReturnValue({ flags: ['gas'], guestMessage: 'Leave the property and call emergency services.' });
    const res = await previewServiceRequest(jsonReq({ message: 'I smell gas in the kitchen', transcript: [] }), PARAMS);
    const json = await res.json();
    expect(json.status).toBe('safety_escalated');
    expect(json.guestMessage).toContain('emergency');
    expect(json.reference).toMatch(/^PRV-/);
    expect(runInterviewTurn).not.toHaveBeenCalled();
    expect(insertCalls).toEqual([]);
  });

  it('runs the interview engine and returns the same contract as the guest route', async () => {
    runSafetyTriage.mockReturnValue(null);
    runInterviewTurn.mockResolvedValue({ type: 'question', question: 'Where is the leak?', choices: ['Kitchen', 'Bathroom'] });
    const res = await previewServiceRequest(jsonReq({ message: 'The sink is leaking', transcript: [] }), PARAMS);
    const json = await res.json();
    expect(json.status).toBe('in_progress');
    expect(json.question).toBe('Where is the leak?');
    expect(json.choices).toEqual(['Kitchen', 'Bathroom']);
    expect(insertCalls).toEqual([]);
  });

  it('returns a report and PRV- reference on the final turn', async () => {
    runSafetyTriage.mockReturnValue(null);
    runInterviewTurn.mockResolvedValue({ type: 'final', report: { category: 'maintenance', severity: 'medium', summary: 'Leaky sink' } });
    const res = await previewServiceRequest(jsonReq({ message: 'Under the kitchen sink', transcript: [{ role: 'guest', text: 'The sink is leaking' }] }), PARAMS);
    const json = await res.json();
    expect(json.status).toBe('completed');
    expect(json.report.summary).toBe('Leaky sink');
    expect(json.reference).toMatch(/^PRV-/);
  });
});

describe('preview-extras-request', () => {
  it('404s when the offer does not belong to the property', async () => {
    adminRow = null; // offer lookup resolves to nothing
    const res = await previewExtrasRequest(jsonReq({ offerId: crypto.randomUUID(), guestName: 'Preview Host' }), PARAMS);
    expect(res.status).toBe(404);
    expect(insertCalls).toEqual([]);
  });

  it('returns a PRV- reference for a live offer without writing anything', async () => {
    adminRow = { id: 'offer-1' };
    const offerId = crypto.randomUUID();
    const res = await previewExtrasRequest(jsonReq({ offerId, guestName: 'Preview Host', quantity: 2 }), PARAMS);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requestNumber).toMatch(/^PRV-[0-9A-Z]{6}$/);
    expect(insertCalls).toEqual([]);
  });
});
