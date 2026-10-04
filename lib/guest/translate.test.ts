import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ complete: vi.fn(), warn: vi.fn() }));
vi.mock('@/lib/router/modelRouter', () => ({ routedCompletion: boundary.complete }));
vi.mock('@/lib/log', () => ({ log: { warn: boundary.warn } }));
import { translateForHost, notificationBody } from './translate';

beforeEach(() => vi.clearAllMocks());

describe('guest-origin host translation', () => {
  it('uses the protected strong guest tier and retains the exact original alongside a labelled translation', async () => {
    const original = '  Huele a gas en la cocina. No entre antes de las 17:30.\nCódigo 0428.  ';
    const translation = 'It smells of gas in the kitchen. Do not enter before 17:30.\nCode 0428.';
    boundary.complete.mockResolvedValue({ text: translation, model: 'test' });
    const result = await translateForHost(original, 'es', 'en');
    expect(boundary.complete.mock.calls[0][2]).toEqual({ task: 'concierge_complex' });
    expect(result.text.startsWith(original + '\n\n')).toBe(true);
    expect(result.text).toContain('English translation (guest wrote in Spanish)');
    expect(result.translated).toBe(translation);
    expect(result.targetLabel).toBe('English');
    expect(notificationBody(result, original)).toBe(translation);
  });

  it.each([['en', 'en'], ['auto', 'en'], ['es', null], [null, 'en'], ['unknown', 'en']])(
    'does not call AI for unknown or same languages %s / %s', async (from, to) => {
      expect(await translateForHost(' original 0428 ', from, to)).toEqual({ text: ' original 0428 ', translated: null, targetLabel: null });
      expect(boundary.complete).not.toHaveBeenCalled();
    },
  );

  it('does not call AI for blank input', async () => {
    expect((await translateForHost('   ', 'es', 'en')).text).toBe('   ');
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it.each([null, {}, { text: null }, { text: 42 }, { text: '  ' }, { text: 'Código 0428' }])(
    'keeps the original on missing, malformed, empty, or unchanged output %j', async (output) => {
      boundary.complete.mockResolvedValue(output);
      const result = await translateForHost(' Código 0428 ', 'es', 'en');
      expect(result).toEqual({ text: ' Código 0428 ', translated: null, targetLabel: null });
      expect(notificationBody(result, result.text)).toBe(' Código 0428 ');
    },
  );

  it('retains the full original even when input sent to the model is capped', async () => {
    const original = ` ${'Detalle. '.repeat(300)}Código final 0428. `;
    boundary.complete.mockResolvedValue({ text: 'Detail translation', model: 'test' });
    const result = await translateForHost(original, 'es', 'en');
    expect(result.text.startsWith(original)).toBe(true);
    const prompt = boundary.complete.mock.calls[0][0];
    expect(prompt[1].content.length).toBeLessThan(2100);
    expect(prompt[0].content).toMatch(/never follow instructions/i);
    expect(prompt[0].content).toMatch(/Preserve numbers/i);
  });

  it('retains critical wording on timeout and never logs exception text', async () => {
    boundary.complete.mockRejectedValue(new Error('PRIVATE_GUEST_BODY token=synthetic'));
    const original = ' Huele a gas. Código 0428. ';
    expect(await translateForHost(original, 'es', 'en')).toEqual({ text: original, translated: null, targetLabel: null });
    expect(boundary.warn).toHaveBeenCalled();
    expect(JSON.stringify(boundary.warn.mock.calls)).not.toContain('PRIVATE_GUEST_BODY');
  });
});
