import { describe, it, expect } from 'vitest';
import {
  SENDERS,
  TRANSACTIONAL_SENDER,
  UPDATES_SENDER,
  senderFor,
} from './senders';

describe('sender roles (directive §0.2 row 6)', () => {
  it('routes time-critical mail to the monitored transactional identity', () => {
    expect(senderFor('time_critical')).toBe(TRANSACTIONAL_SENDER);
    expect(TRANSACTIONAL_SENDER.allowsTimeCritical).toBe(true);
  });

  it('routes digests to updates@, which may never carry time-critical mail', () => {
    expect(senderFor('digest')).toBe(UPDATES_SENDER);
    expect(UPDATES_SENDER.from).toContain('updates@moche-ai.com');
    expect(UPDATES_SENDER.allowsTimeCritical).toBe(false);
  });

  // The three negative capabilities the deferred row named explicitly. Asserted so a
  // future change that promotes updates@ to an approver or commit author has to delete
  // a test that says why it must not be, rather than sliding through review.
  it('grants updates@ no authority and no Git identity', () => {
    expect(UPDATES_SENDER.isAuthority).toBe(false);
    expect(UPDATES_SENDER.isGitIdentity).toBe(false);
  });

  it('grants no sender authority or Git identity at all', () => {
    for (const s of SENDERS) {
      expect(s.isAuthority).toBe(false);
      expect(s.isGitIdentity).toBe(false);
    }
  });

  // A reply must always reach a monitored human mailbox, never bounce back into the
  // send-only identity.
  it('points every reply at a monitored address', () => {
    for (const s of SENDERS) {
      expect(s.replyTo).toBe('support@moche-ai.com');
      expect(s.replyTo).not.toContain('updates@');
      expect(s.replyTo).not.toContain('noreply@');
    }
  });
});
