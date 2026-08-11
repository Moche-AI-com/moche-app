import { describe, expect, it } from 'vitest';
import { ALLOWED_TRANSITIONS, canTransition } from '@/lib/service-requests/lifecycle';

describe('service request lifecycle', () => {
  it('allows an open request to move directly to in progress or completed', () => {
    expect(canTransition('new', 'in_progress')).toBe(true);
    expect(canTransition('new', 'resolved')).toBe(true);
    expect(ALLOWED_TRANSITIONS.new).toEqual(expect.arrayContaining(['in_progress', 'resolved']));
  });

  it('preserves the existing forward and reopen transitions', () => {
    expect(canTransition('acknowledged', 'waiting_on_guest')).toBe(true);
    expect(canTransition('waiting_on_guest', 'in_progress')).toBe(true);
    expect(canTransition('resolved', 'in_progress')).toBe(true);
    expect(canTransition('closed', 'new')).toBe(false);
  });
});
