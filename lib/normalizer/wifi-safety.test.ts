import { describe, expect, it } from 'vitest';
import { wifiSchema, renderContent } from './schemas';
import { buildNormalizerPrompt } from './prompts';
import { normalizeToNode } from './index';

describe('normalizer Wi-Fi instruction-only output', () => {
  it('drops legacy password keys and keeps host-supplied location', () => {
    const result = wifiSchema.parse({
      password: 'Secret987!', password_location: 'On the welcome card in the study.',
      instructions: 'Choose the guest network and use the details on that card.',
    });
    expect(result).not.toHaveProperty('password');
    expect(result).toHaveProperty('password_location', 'On the welcome card in the study.');
    expect(renderContent('wifi', result)).toContain('Wi-Fi password location: On the welcome card in the study.');
  });
  it('refuses password-only extraction and never renders legacy credentials', () => {
    expect(wifiSchema.safeParse({ password: 'Secret987!' }).success).toBe(false);
    expect(renderContent('wifi', { password: 'Secret987!' })).not.toContain('Secret987!');
    expect(renderContent('wifi', { instructions: 'Use password: Secret987!' })).not.toContain('Secret987!');
  });
  it('rejects a credential stored under an instructions field', () => {
    expect(wifiSchema.safeParse({ instructions: 'Secret987!' }).success).toBe(false);
    expect(renderContent('wifi', { instructions: 'Secret987!' })).not.toContain('Secret987!');
  });
  it('asks for location rather than a verbatim credential', () => {
    const prompt = buildNormalizerPrompt('wifi');
    expect(prompt).toContain('"password_location"');
    expect(prompt).not.toContain('"password":');
    expect(prompt).toContain('Never infer a location');
  });
  it('refuses a structured location that the host never supplied', async () => {
    const node = await normalizeToNode({ nodeType: 'wifi', title: 'Wi-Fi', body: 'Guest internet is available.' },
      async () => ({ text: '{"password_location":"On the fridge."}', model: 'strong' }));
    expect(node).toBeNull();
  });
});
