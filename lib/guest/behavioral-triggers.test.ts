import { describe, expect, it } from 'vitest';
import {
  behavioralEscalation,
  detectHumanRequest,
  detectRepeatQuestion,
  questionSimilarity,
} from './behavioral-triggers';

describe('detectHumanRequest', () => {
  it('catches explicit English requests for a person', () => {
    expect(detectHumanRequest('Can I talk to the host?')).toBe(true);
    expect(detectHumanRequest('I want to speak to a human please')).toBe(true);
    expect(detectHumanRequest('Please get me a real person')).toBe(true);
    expect(detectHumanRequest('I need to reach the property manager')).toBe(true);
    expect(detectHumanRequest('Is there someone I can call?')).toBe(true);
  });

  it('catches requests in the portal languages', () => {
    expect(detectHumanRequest('Quiero hablar con el anfitrión')).toBe(true);
    expect(detectHumanRequest('Je veux parler à un humain')).toBe(true);
    expect(detectHumanRequest('Ich möchte mit dem Gastgeber sprechen')).toBe(true);
    expect(detectHumanRequest('Quero falar com uma pessoa real')).toBe(true);
    expect(detectHumanRequest('Vorrei parlare con una persona vera')).toBe(true);
    expect(detectHumanRequest('Kan ik contact opnemen met de eigenaar?')).toBe(true);
  });

  it('ignores neutral property questions and mentions', () => {
    expect(detectHumanRequest('What time is checkout?')).toBe(false);
    expect(detectHumanRequest('Where is the host manual for the oven?')).toBe(false);
    expect(detectHumanRequest('The owner left a welcome note on the fridge')).toBe(false);
    expect(detectHumanRequest('How do I contact the cleaning supply closet?')).toBe(false);
  });
});

describe('questionSimilarity', () => {
  it('scores rephrased repeats high and distinct questions low', () => {
    expect(
      questionSimilarity('What is the wifi password?', "What's the Wi-Fi password again?"),
    ).toBeGreaterThanOrEqual(0.6);
    expect(questionSimilarity('What time is checkout?', 'Where is the coffee?')).toBeLessThan(0.6);
    expect(questionSimilarity('', 'anything at all')).toBe(0);
  });
});

describe('detectRepeatQuestion', () => {
  it('fires on a re-asked question and ignores first asks', () => {
    const prior = ['Where is the trash bin?', 'What time is checkout?'];
    expect(detectRepeatQuestion('Where do I find the trash bin?', prior)).toBe(true);
    expect(detectRepeatQuestion('How do I use the coffee machine?', prior)).toBe(false);
  });

  it('ignores short turns that cannot carry intent', () => {
    expect(detectRepeatQuestion('hi', ['hi', 'hello'])).toBe(false);
    expect(detectRepeatQuestion('wifi', ['wifi password'])).toBe(false);
  });
});

describe('behavioralEscalation', () => {
  it('escalates a human request even with no history', () => {
    const result = behavioralEscalation('Can I please talk to the host?', []);
    expect(result).toEqual({ escalate: true, trigger: 'human_request' });
  });

  it('escalates when the same question comes around again', () => {
    const history = [
      { role: 'user', content: 'Where is the trash bin?' },
      { role: 'assistant', content: 'Under the kitchen sink.' },
    ];
    const result = behavioralEscalation('Where do I find the trash bin?', history as never);
    expect(result).toEqual({ escalate: true, trigger: 'repeat_question' });
  });

  it('leaves ordinary first-time questions alone', () => {
    const history = [{ role: 'user', content: 'What is the wifi password?' }];
    const result = behavioralEscalation('What time is checkout on Sunday?', history as never);
    expect(result.escalate).toBe(false);
  });
});
