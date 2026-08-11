import { describe, expect, it } from 'vitest';
import { canAnswerEscalation, canTeachFromEscalation, canViewEscalationInbox } from './escalations-permissions';

describe('escalation permission gates', () => {
  it('denies an unassigned or unauthorized member all escalation controls', () => {
    const capabilities = { canReceiveEscalations: false, canReplyGuests: false, canEditBrain: false };
    expect(canViewEscalationInbox(capabilities)).toBe(false);
    expect(canAnswerEscalation(capabilities)).toBe(false);
    expect(canTeachFromEscalation(capabilities)).toBe(false);
  });

  it('lets a reply-only member answer without teaching the Brain', () => {
    const capabilities = { canReceiveEscalations: true, canReplyGuests: true, canEditBrain: false };
    expect(canViewEscalationInbox(capabilities)).toBe(true);
    expect(canAnswerEscalation(capabilities)).toBe(true);
    expect(canTeachFromEscalation(capabilities)).toBe(false);
  });

  it('requires all relevant capabilities to teach from an answer', () => {
    expect(canTeachFromEscalation({ canReceiveEscalations: true, canReplyGuests: true, canEditBrain: true })).toBe(true);
  });
});
