import { describe, expect, it } from 'vitest';
import { classifyCredentialQuestion, doorCodeEscalationQuestion, doorCodeEscalationReply } from './credential-questions';

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
  ])('classifies Wi-Fi password questions (left to wifi-instructions): %s', (q) => {
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

  it('never contains a code in the guest reply', () => {
    expect(doorCodeEscalationReply()).not.toMatch(/\d/);
  });

  it('marks lockouts urgent', () => {
    expect(doorCodeEscalationQuestion('I am locked out').urgent).toBe(true);
    expect(doorCodeEscalationQuestion('what is the door code for tomorrow').urgent).toBe(false);
  });
});
