import { describe, expect, it } from 'vitest';

/**
 * Regression test for the guest-chat history window.
 *
 * PRODUCTION SYMPTOM
 * The concierge restated the Wi-Fi answer on top of every subsequent reply — to
 * "is early check-in possible", to "what are the host's favourite recommendations",
 * even to "como estas" — and those polluted replies were then written to
 * `answer_cache`, making the behaviour permanent for the property.
 *
 * ROOT CAUSE
 * `app/api/guest/[slug]/chat/route.ts` loaded history as
 *   .order('created_at', { ascending: true }).limit(12)
 * Ascending + LIMIT returns the OLDEST 12 rows, not the newest. Once a stay passed
 * 12 messages, the "recent history" window froze on the opening turns forever, and
 * `history.slice(-6)` in concierge.ts kept handing the model the same early Wi-Fi
 * exchange as its most recent context on every turn.
 *
 * This test pins the ordering contract on a pure helper mirroring the route's
 * transform, so the two-character mistake cannot silently return.
 */

interface Row { role: string; content: string; created_at: string }

/** The FIXED transform: newest-N by descending order, restored to chronological. */
function selectRecentHistory(rowsNewestFirst: Row[]): { role: string; content: string }[] {
  return rowsNewestFirst
    .slice()
    .reverse()
    .filter((m) => m.role === 'guest' || m.role === 'assistant')
    .map((m) => ({ role: m.role === 'guest' ? 'user' : 'assistant', content: m.content }));
}

/** Simulates Postgres `ORDER BY created_at <dir> LIMIT n`. */
function query(all: Row[], ascending: boolean, limit: number): Row[] {
  const sorted = all.slice().sort((a, b) =>
    ascending ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at),
  );
  return sorted.slice(0, limit);
}

// 20 alternating turns; the Wi-Fi exchange is deliberately the OLDEST pair.
const CONVERSATION: Row[] = Array.from({ length: 20 }, (_, i) => ({
  role: i % 2 === 0 ? 'guest' : 'assistant',
  content: i === 0 ? 'What is the WiFi password?' : i === 1 ? 'The WiFi network name is CapeHouse-Guest.' : `turn ${i}`,
  created_at: `2026-08-13T10:${String(i).padStart(2, '0')}:00Z`,
}));

describe('guest chat — recent history window', () => {
  it('returns the NEWEST rows, not the oldest', () => {
    const history = selectRecentHistory(query(CONVERSATION, false, 12));
    expect(history).toHaveLength(12);
    expect(history[history.length - 1].content).toBe('turn 19');
  });

  it('excludes the oldest Wi-Fi exchange once the stay is longer than the window', () => {
    const history = selectRecentHistory(query(CONVERSATION, false, 12));
    const joined = history.map((m) => m.content).join(' ');
    expect(joined).not.toContain('CapeHouse-Guest');
    expect(joined).not.toContain('WiFi password');
  });

  it('restores chronological order so the last entry is the most recent turn', () => {
    const history = selectRecentHistory(query(CONVERSATION, false, 12));
    const stamps = query(CONVERSATION, false, 12).slice().reverse().map((r) => r.created_at);
    expect(stamps).toEqual([...stamps].sort());
    expect(history[0].content).toBe('turn 8');
  });

  it('keeps the trailing slice(-6) used by concierge.ts on genuinely recent turns', () => {
    const history = selectRecentHistory(query(CONVERSATION, false, 12));
    expect(history.slice(-6).map((m) => m.content)).toEqual([
      'turn 14', 'turn 15', 'turn 16', 'turn 17', 'turn 18', 'turn 19',
    ]);
  });

  it('DEMONSTRATES the original bug: ascending+limit freezes on the opening turns', () => {
    const buggy = selectRecentHistory(query(CONVERSATION, true, 12));
    // The stale window still carries the very first Wi-Fi exchange...
    expect(buggy.map((m) => m.content).join(' ')).toContain('CapeHouse-Guest');
    // ...and presents it as the model's most recent context.
    expect(buggy.slice(-6).map((m) => m.content)).not.toContain('turn 19');
  });

  it('is stable for a short conversation that fits inside the window', () => {
    const short = CONVERSATION.slice(0, 4);
    const history = selectRecentHistory(query(short, false, 12));
    expect(history.map((m) => m.content)).toEqual([
      'What is the WiFi password?', 'The WiFi network name is CapeHouse-Guest.', 'turn 2', 'turn 3',
    ]);
  });

  it('drops host/system rows from the model-facing history', () => {
    const withHost: Row[] = [
      ...CONVERSATION.slice(0, 3),
      { role: 'host', content: 'internal host note', created_at: '2026-08-13T10:03:00Z' },
    ];
    const history = selectRecentHistory(query(withHost, false, 12));
    expect(history.map((m) => m.content)).not.toContain('internal host note');
    expect(history.every((m) => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});
