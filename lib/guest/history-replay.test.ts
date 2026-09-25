import { describe, expect, it } from 'vitest';
import { LEGACY_WIFI_NOTICE, serializeGuestHistory, type GuestHistoryRow } from './history-replay';

function row(id: string, role: string, content: string, safe = false): GuestHistoryRow {
  return { id, role, content, created_at: '2026-09-25T19:00:00Z', model: role === 'assistant' ? 'openai/gpt-4o' : null, intent: null, guest_replay_safe: safe };
}

describe('guest AI history replay', () => {
  it('returns stable database IDs and preserves safe assistant replies after Wi-Fi turns', () => {
    const result = serializeGuestHistory([row('q1', 'guest', 'Where is the Wi-Fi router?'), row('a1', 'assistant', 'Ask your host for its location.', true), row('q2', 'guest', 'Yo'), row('a2', 'assistant', 'Hi there!', true)]);
    expect(result.map((r) => r.id)).toEqual(['q1', 'a1', 'q2', 'a2']);
    expect(result.map((r) => r.content)).toEqual(['Where is the Wi-Fi router?', 'Ask your host for its location.', 'Yo', 'Hi there!']);
  });
  it('masks only the legacy Wi-Fi reply, not every later answer', () => {
    const result = serializeGuestHistory([row('q1', 'guest', 'Wi-Fi?'), row('a1', 'assistant', 'Old unverified answer'), row('q2', 'guest', 'Yo'), row('a2', 'assistant', 'Hi there!')]);
    expect(result[1].content).toBe(LEGACY_WIFI_NOTICE);
    expect(result[3].content).toBe('Hi there!');
  });
  it('masks a legacy Wi-Fi reply in a delta after the question', () => {
    expect(serializeGuestHistory([row('a1', 'assistant', 'Old unverified answer')], 'Wi-Fi?')[0].content).toBe(LEGACY_WIFI_NOTICE);
  });
  it('keeps non-Wi-Fi guest and host text intact', () => {
    expect(serializeGuestHistory([row('q', 'guest', 'Hello'), row('h', 'host', 'Hi')]).map((r) => r.content)).toEqual(['Hello', 'Hi']);
  });
});
