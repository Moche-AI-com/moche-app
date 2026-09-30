import { describe, expect, it } from 'vitest';
import { classifyCredentialQuestion, doorCodeEscalationQuestion, wifiGuidanceReply } from './credential-questions';

describe('credential questions', () => {
  it.each([
    'What is the door code?',
    'whats the lockbox combo',
    'Can you send the code for the front door',
    'I am locked out!',
    'I can’t get in',
    'keypad pin?',
  ])('escalates door/entry questions: %s', (q) => {
    expect(classifyCredentialQuestion(q)).toBe('door_code');
  });

  it.each([
    'What is the wifi password?',
    'wi-fi pw pls',
    'password for the wifi',
    'Internet password?',
  ])('guides Wi-Fi password questions: %s', (q) => {
    expect(classifyCredentialQuestion(q)).toBe('wifi_password');
  });

  it.each([
    'Is there wifi?',
    'What is the wifi network name?',
    'How do I get into town?',
    'Where do I park?',
    'The front door is squeaky',
  ])('leaves ordinary questions to the concierge: %s', (q) => {
    expect(classifyCredentialQuestion(q)).toBeNull();
  });

  it('never echoes a credential, only the host location hint', () => {
    expect(wifiGuidanceReply('on the card on the fridge')).toContain('on the card on the fridge');
    expect(wifiGuidanceReply(null)).toContain('router');
  });

  it('marks lockouts urgent', () => {
    expect(doorCodeEscalationQuestion('I am locked out').urgent).toBe(true);
    expect(doorCodeEscalationQuestion('what is the door code for tomorrow').urgent).toBe(false);
  });
});
