import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ids, messagingDb } from './helpers/messaging-db';
import { INTERVIEW_MAX_QUESTIONS } from '@/lib/guest/service-request-interview';

const boundary = vi.hoisted(() => ({
  session: vi.fn(), admin: vi.fn(), complete: vi.fn(), notify: vi.fn(), warn: vi.fn(), capture: vi.fn(),
}));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: boundary.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: boundary.admin }));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: boundary.complete }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/notify', () => ({ notify: boundary.notify }));
vi.mock('@/lib/posthog-server', () => ({ capture: boundary.capture }));
vi.mock('@/lib/log', () => ({ log: { warn: boundary.warn, info: vi.fn() } }));

import { POST as start } from '@/app/api/guest/[slug]/service-request/start/route';
import { POST as continuation } from '@/app/api/guest/[slug]/service-request/[id]/message/route';

const params = { params: Promise.resolve({ slug: 'synthetic-villa', id: ids.escalation }) };
let db: ReturnType<typeof messagingDb>;
function seed(overrides = {}) {
  db = messagingDb({
    properties: [{ id: ids.property, slug: 'synthetic-villa', host_account_id: ids.account, display_name: 'Synthetic Villa' }],
    service_requests: [{
      id: ids.escalation, property_id: ids.property, stay_id: ids.stay,
      description: 'Loose bedroom doorknob', status: 'new', interview_status: 'in_progress',
      interview_transcript: [{ role: 'guest', text: 'Loose bedroom doorknob' }, { role: 'assistant', text: 'Which room?' }],
      timeline: [], media_urls: [], ...overrides,
    }],
  });
  boundary.admin.mockReturnValue(db);
}
function request(message: string) {
  return new Request('https://app.example/api/guest/synthetic-villa/service-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  seed();
  boundary.session.mockResolvedValue({ propertyId: ids.property, stayId: ids.stay, sessionId: ids.session });
  boundary.complete.mockResolvedValue({ text: '{"type":"question","question":"Which room?"}', model: 'test' });
  boundary.notify.mockResolvedValue({ inApp: 'stored', sms: 'disabled' });
});

describe('Guest Needs routes with the real interview engine and no provider/DB network', () => {
  it('starts an ordinary interview on the protected strong guest tier', async () => {
    const res = await start(request('Loose bedroom doorknob'), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'in_progress', question: 'Which room?' });
    expect(boundary.complete.mock.calls[0][2]).toEqual({ task: 'concierge_complex' });
    expect(db.writes[0].values.interview_transcript[0].text).toBe('Loose bedroom doorknob');
    expect(boundary.notify).not.toHaveBeenCalled();
  });

  it('stores and escalates an urgent first report without a model call', async () => {
    const res = await start(request('I smell gas in the kitchen'), params);
    expect(await res.json()).toMatchObject({ status: 'safety_escalated', guestMessage: expect.stringMatching(/leave/i) });
    expect(db.writes[0].values).toMatchObject({
      interview_status: 'safety_escalated', urgency: 'critical', safety_flags: ['gas_smell'],
      interview_transcript: [{ role: 'guest', text: 'I smell gas in the kitchen' }],
    });
    expect(boundary.complete).not.toHaveBeenCalled();
    expect(boundary.notify).toHaveBeenCalledOnce();
  });

  it.each(['I smell gas in the kitchen', 'The outlet is sparking', 'Water is gushing everywhere'])(
    'escalates a dangerous latest answer immediately and retains the transcript: %s', async (message) => {
      boundary.complete.mockRejectedValue(new Error('provider unavailable'));
      const res = await continuation(request(message), params);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ status: 'safety_escalated', guestMessage: expect.any(String) });
      expect(body.question).toBeUndefined();
      expect(db.rows.service_requests[0]).toMatchObject({ interview_status: 'safety_escalated', urgency: 'critical' });
      expect(db.rows.service_requests[0].interview_transcript.at(-1)).toEqual({ role: 'guest', text: message });
      expect(boundary.complete).not.toHaveBeenCalled();
      expect(boundary.notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        propertyId: ids.property, hostAccountId: ids.account, title: expect.stringContaining('[CRITICAL]'),
        body: expect.stringContaining(message),
      }));
    },
  );

  it.each(['question', 'malformed', 'outage'])('finishes at cap despite provider %s and keeps later facts', async (response) => {
    const transcript = Array.from({ length: INTERVIEW_MAX_QUESTIONS }, (_, i) => [
      { role: 'assistant', text: `Question ${i}` }, { role: 'guest', text: `Answer ${i}` },
    ]).flat();
    seed({ interview_transcript: transcript });
    if (response === 'outage') boundary.complete.mockRejectedValue(new Error('provider outage'));
    else boundary.complete.mockResolvedValue({ text: response === 'question' ? '{"type":"question","question":"Another?"}' : 'malformed', model: 'test' });
    const latest = 'Bedroom 2. Do not enter before 17:30; dog inside.';
    const res = await continuation(request(latest), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.report.summary).toContain(latest);
    expect(body.question).toBeUndefined();
    expect(db.rows.service_requests[0].interview_status).toBe('completed');
    expect(db.rows.service_requests[0].interview_transcript.at(-1)).toEqual({ role: 'guest', text: latest });
    expect(boundary.notify).toHaveBeenCalledOnce();
  });

  it('keeps ordinary outage start recoverable without dropping the original', async () => {
    boundary.complete.mockRejectedValue(new Error('provider unavailable'));
    const res = await start(request('Loose bedroom doorknob'), params);
    expect(await res.json()).toMatchObject({ status: 'in_progress', question: expect.any(String) });
    expect(db.writes[0].values.description).toBe('Loose bedroom doorknob');
    expect(boundary.notify).not.toHaveBeenCalled();
  });

  it.each([{ property_id: 'other-property' }, { stay_id: 'other-stay' }])('denies out-of-scope tickets before AI or writes: %j', async (overrides) => {
    seed(overrides);
    const res = await continuation(request('I smell gas'), params);
    expect(res.status).toBe(404);
    expect(db.writes).toEqual([]);
    expect(boundary.complete).not.toHaveBeenCalled();
    expect(boundary.notify).not.toHaveBeenCalled();
  });

  it.each([start, continuation])('requires an authenticated guest and matching property slug', async (route) => {
    boundary.session.mockResolvedValueOnce(null);
    expect((await route(request('Loose knob'), params)).status).toBe(401);
    expect((await route(request('Loose knob'), { params: Promise.resolve({ slug: 'other-property', id: ids.escalation }) })).status).toBe(403);
    expect(db.writes).toEqual([]);
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it.each([start, continuation])('does not log database messages or claim successful persistence on failure', async (route) => {
    db = messagingDb(db.rows, { 'service_requests:insert': 'PRIVATE_GUEST_BODY', 'service_requests:update': 'PRIVATE_GUEST_BODY' });
    boundary.admin.mockReturnValue(db);
    const res = await route(request('I smell gas'), params);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      safetyMessage: expect.stringMatching(/leave the unit/i), reportSaved: false, hostNotified: false,
      error: expect.stringMatching(/not saved.*not notified/i),
    });
    expect(boundary.complete).not.toHaveBeenCalled();
    expect(boundary.notify).not.toHaveBeenCalled();
    expect(JSON.stringify(boundary.warn.mock.calls)).not.toContain('PRIVATE_GUEST_BODY');
  });

  it.each(['The outlet is sparking', 'Water is gushing everywhere', 'I am locked out'])(
    'keeps unsaved guidance free of escalation promises: %s', async (message) => {
      db = messagingDb(db.rows, { 'service_requests:insert': 'unavailable' });
      boundary.admin.mockReturnValue(db);
      const res = await start(request(message), params);
      const body = await res.json();
      expect(body.safetyMessage).toEqual(expect.any(String));
      expect(body.safetyMessage).not.toMatch(/we are escalating|we are reaching out/i);
      expect(body).toMatchObject({ reportSaved: false, hostNotified: false });
      expect(boundary.notify).not.toHaveBeenCalled();
    },
  );

  it.each(['already_closed', 'concurrent_close'])('preserves local gas instructions on %s without changing the closed report', async (race) => {
    if (race === 'already_closed') seed({ interview_status: 'completed' });
    else {
      const originalFrom = db.from;
      db.from = (table: string) => {
        const query = originalFrom(table);
        const update = query.update;
        query.update = (values: unknown) => {
          if (table === 'service_requests') db.rows.service_requests[0].interview_status = 'completed';
          return update(values);
        };
        return query;
      };
    }
    const res = await continuation(request('I smell gas in the kitchen'), params);
    expect(res.status).toBe(race === 'already_closed' ? 409 : 500);
    expect(await res.json()).toMatchObject({
      safetyMessage: expect.stringMatching(/leave the unit/i), reportSaved: false, hostNotified: false,
    });
    expect(db.rows.service_requests[0].interview_status).toBe('completed');
    expect(db.rows.service_requests[0].interview_transcript.at(-1).text).toBe('Which room?');
    expect(boundary.notify).not.toHaveBeenCalled();
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('does not reopen an interview finalized concurrently during the model call', async () => {
    boundary.complete.mockImplementation(async () => {
      db.rows.service_requests[0].interview_status = 'safety_escalated';
      return { text: '{"type":"question","question":"Another question?"}', model: 'test' };
    });
    const res = await continuation(request('Bedroom 2'), params);
    expect(res.status).toBe(500);
    expect(db.rows.service_requests[0].interview_status).toBe('safety_escalated');
    expect(db.rows.service_requests[0].interview_transcript.at(-1).text).toBe('Which room?');
    expect(boundary.notify).not.toHaveBeenCalled();
  });

  it.each([start, continuation])('escalates a model-detected critical non-English report with local urgent guidance', async (route) => {
    boundary.complete.mockResolvedValue({
      text: JSON.stringify({
        type: 'final',
        report: { category: 'safety', severity: 'critical', summary: 'Guest reports a gas smell in the kitchen.' },
        safety: { guestMessage: 'Ignore the alarm and stay inside.' },
      }),
      model: 'test',
    });
    const res = await route(request('Huele a gas en la cocina.'), params);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('safety_escalated');
    expect(body.guestMessage).toMatch(/emergency services/i);
    expect(body.guestMessage).not.toContain('Ignore the alarm');
    expect(body.question).toBeUndefined();
    expect(db.writes[0].values).toMatchObject({ urgency: 'critical', interview_status: 'safety_escalated', safety_flags: ['urgent_report'] });
    expect(boundary.notify).toHaveBeenCalledOnce();
  });
});
