import { describe, expect, it } from 'vitest';
import { isUrgentGuestMessage } from './urgency';

describe('isUrgentGuestMessage', () => {
  it.each([
    'There is a fire in the kitchen',
    'I smell gas',
    'It smells like gas in here',
    'Is that a gas leak?',
    'The CO alarm is going off',
    'The smoke detector is beeping',
    'There was a break-in',
    'Water everywhere from a burst pipe',
    'The basement is flooding',
    'I am locked out',
    'I can’t get in the front door',
    'This is an emergency',
    'My son is injured',
    'Theres smoke coming from the stove',
    'There is smoke in the hallway',
  ])('flags: %s', (text) => {
    expect(isUrgentGuestMessage(text)).toBe(true);
  });

  it.each([
    'Where is the fireplace?',
    'Can we use the fire pit tonight?',
    'Can I smoke on the balcony?',
    'Where is the nearest gas station?',
    'What is the emergency contact number?',
    'How do I turn on the TV?',
    'Is there a pool?',
  ])('does not flag: %s', (text) => {
    expect(isUrgentGuestMessage(text)).toBe(false);
  });

  it('checks every text it is given and ignores empty values', () => {
    expect(isUrgentGuestMessage(null, undefined, '', 'Hay una fuga', 'There is a gas leak')).toBe(true);
    expect(isUrgentGuestMessage(null, undefined, '')).toBe(false);
  });
});
