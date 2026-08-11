import { describe, expect, it } from 'vitest';
import { classifyFactSensitivity } from './sensitivity';

describe('classifyFactSensitivity', () => {
  it.each([
    'Front door code', 'Wi-Fi password', 'Alarm PIN', 'Safe combination', 'Vendor account number',
  ])('marks %s as sensitive', (label) => {
    expect(classifyFactSensitivity(label, '1234')).toBe('sensitive');
  });

  it('keeps ordinary property facts normal', () => {
    expect(classifyFactSensitivity('Check-out time', '10:00 AM')).toBe('normal');
  });
});
