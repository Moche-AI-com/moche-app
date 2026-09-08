import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), client: vi.fn() }));
vi.mock('@/lib/guest/session', () => ({ getGuestSession: mocks.session }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.client }));
import { GET } from '@/app/api/guest/[slug]/messages/route';

const stamp = '2026-09-01T00:00:00Z';
const row = (role: string, content: string) => ({ role, content, created_at: stamp, model: 'legacy-model' });
function database(rows: ReturnType<typeof row>[], priorWifi = false, contextError = false) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gt', 'lte', 'or', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => { calls.push([table, method, ...args]); return query; };
    }
    query.maybeSingle = async () => ({
      data: table === 'properties' ? { id: 'property', slug: 'villa' }
        : table === 'conversations' ? { id: 'conversation' } : priorWifi ? { id: 'old-wifi-turn' } : null,
      error: table === 'messages' && contextError ? { message: 'unavailable' } : null,
    });
    query.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    return query;
  });
  mocks.client.mockReturnValue({ from });
  return { from, calls };
}
async function read(after = '') {
  return GET(new Request(`https://example.test/api/guest/villa/messages${after ? `?after=${after}` : ''}`),
    { params: Promise.resolve({ slug: 'villa' }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ propertyId: 'property', stayId: 'stay', sessionId: 'session' });
});

describe('server concierge history credential containment', () => {
  it('replaces the exact legacy labelled password fixture before returning JSON', async () => {
    database([row('assistant', 'The Wi-Fi password is SyntheticLegacy2026.')]);
    const response = await read();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('SyntheticLegacy2026');
    expect(body.messages[0].content).toMatch(/host.*location/i);
  });
  it('contains bare answers and implicit follow-ups using earlier Wi-Fi context', async () => {
    database([
      row('guest', 'What is the Wi-Fi password?'), row('assistant', 'SyntheticLegacy2026!'),
      row('guest', 'Repeat that please'), row('assistant', 'blue turtles jump'),
    ]);
    const body = await (await read()).json();
    expect(body.messages.filter((m: { role: string }) => m.role === 'assistant')
      .every((m: { content: string }) => /host.*location/i.test(m.content))).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/SyntheticLegacy2026|blue turtles jump/);
  });
  it('does not replay a historical unverified physical password location', async () => {
    database([row('assistant', 'The Wi-Fi password is on the fridge.')]);
    expect(JSON.stringify(await (await read()).json())).not.toContain('fridge');
  });
  it('contains an incremental bare answer when the Wi-Fi question precedes after', async () => {
    const db = database([row('assistant', 'blue turtles jump')], true);
    const body = await (await read(stamp)).json();
    expect(JSON.stringify(body)).not.toContain('blue turtles jump');
    expect(db.calls).toContainEqual(['messages', 'lte', 'created_at', stamp]);
    expect(db.calls).toContainEqual(['messages', 'eq', 'conversation_id', 'conversation']);
    expect(db.calls).toContainEqual(['messages', 'eq', 'property_id', 'property']);
  });
  it('fails closed when prior incremental context cannot be checked', async () => {
    database([row('assistant', 'blue turtles jump')], false, true);
    expect(JSON.stringify(await (await read(stamp)).json())).not.toContain('blue turtles jump');
  });
  it('preserves ordinary history, public shape and existing session isolation', async () => {
    const db = database([
      row('guest', 'What time is checkout?'), row('assistant', 'Checkout is at 11 am.'),
      row('host', 'I can help with that.'), row('system', 'Internal instructions'),
    ]);
    const body = await (await read(stamp)).json();
    expect(body.messages).toEqual([
      { role: 'guest', content: 'What time is checkout?', created_at: stamp },
      { role: 'assistant', content: 'Checkout is at 11 am.', created_at: stamp },
      { role: 'host', content: 'I can help with that.', created_at: stamp },
    ]);
    for (const [key, value] of [['stay_id', 'stay'], ['property_id', 'property'],
      ['channel', 'ai_concierge'], ['guest_session_id', 'session']]) {
      expect(db.calls).toContainEqual(['conversations', 'eq', key, value]);
    }
  });
  it('refuses expired sessions before database access', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await read()).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
