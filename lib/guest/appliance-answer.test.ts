import { describe, expect, it } from 'vitest';
import { safeApplianceReply } from './appliance-answer';

describe('appliance answer output safety', () => {
  it('accepts ordinary verified-use guidance', () => {
    expect(safeApplianceReply('Press Start on the front panel.')).toBe('Press Start on the front panel.');
  });
  it('rejects empty, credential-bearing and technician instructions', () => {
    expect(safeApplianceReply('  ')).toBeNull();
    expect(safeApplianceReply('Password: mySecret123')).toBeNull();
    expect(safeApplianceReply('Call a licensed electrician to repair the panel.')).toBeNull();
  });
});
