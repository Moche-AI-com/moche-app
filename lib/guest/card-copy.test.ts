import { describe, expect, it } from 'vitest';
import { localizeCardCopy, validateCardCopy, type CopyBundle } from './card-copy';

const source: CopyBundle = {
  cards: [{ key: 'wifi', title: 'Wi-Fi', description: 'Connection help.', prompt: 'What is the password?', prompts: ['What is the network?', 'What is the password?'] }],
  menu: { cardAskTitle: 'Ask Questions' },
};

describe('guest card translations', () => {
  it('keeps the English and automatic paths deterministic', async () => {
    expect(await localizeCardCopy(source, 'en')).toBe(source);
    expect(await localizeCardCopy(source, null)).toBe(source);
    expect(await localizeCardCopy(source, 'auto')).toBe(source);
  });
  it('rejects unsupported languages rather than silently displaying English', async () => {
    await expect(localizeCardCopy(source, 'xx-unsupported')).rejects.toThrow('Unsupported language');
  });
  it('requires identical card identities, question counts and menu keys', () => {
    expect(validateCardCopy(source, source)).toEqual(source);
    expect(() => validateCardCopy({ ...source, cards: [] }, source)).toThrow();
    expect(() => validateCardCopy({ ...source, cards: [{ ...source.cards[0], key: 'other' }] }, source)).toThrow();
    expect(() => validateCardCopy({ ...source, cards: [{ ...source.cards[0], prompts: [] }] }, source)).toThrow();
    expect(() => validateCardCopy({ ...source, menu: {} }, source)).toThrow();
  });
});
