import { describe, expect, it } from 'vitest';
import { safeWifiLocation, safeWifiInstructions, wifiInstructionsFromNotes, wifiAnswer } from './wifi-instructions';
import { redactPII } from '@/lib/ai/redaction';
import { redactCredentials } from '@/lib/brain/redact';

describe('Wi-Fi instruction safety', () => {
  it('keeps the explicit host location and never substitutes a common location', () => {
    expect(safeWifiLocation('On the welcome card in the study.')).toBe('On the welcome card in the study.');
    expect(safeWifiLocation('Secret987!')).toBeNull();
    expect(safeWifiLocation('On the card; password: Secret987!')).toBeNull();
  });
  it('reads location guidance but never legacy password values', () => {
    expect(wifiInstructionsFromNotes([{ title: 'Wi-Fi password', body: 'Secret987!' }]).location).toBeNull();
    expect(wifiInstructionsFromNotes([{
      title: 'Wi-Fi', body: 'The Wi-Fi password is on the welcome card in the study.',
    }]).location).toBe('on the welcome card in the study.');
  });
  it('does not choose between conflicting approved locations', () => {
    expect(wifiInstructionsFromNotes([
      { title: 'Wi-Fi password location', body: 'On the study card.' },
      { title: 'Wi-Fi password location', body: 'Inside the desk drawer.' },
    ]).location).toBeNull();
  });
  it('preserves location field labels through both redaction layers', () => {
    const text = 'Wi-Fi password location: On the welcome card in the study.';
    expect(redactCredentials(text).text).toBe(text);
    expect(redactPII(text)).toBe(text);
  });
  it('does not substitute password location for router location or speed', () => {
    const facts = { location: 'On the study card.', instructions: null, network: null };
    expect(wifiAnswer('Where is the Wi-Fi router?', facts)).toBeNull();
    expect(wifiAnswer('What is the Wi-Fi speed?', facts)).toBeNull();
  });
  it('does not treat a bare password as connection instructions', () => {
    expect(wifiInstructionsFromNotes([
      { title: 'Wi-Fi connection instructions', body: 'Secret987!' },
    ]).instructions).toBeNull();
  });
  it.each([
    'On the router sticker (SyntheticPass2026!).',
    'On the router sticker: SyntheticPass2026',
    'On the card, enter 98765432 to connect.',
    'On the router sticker (sunflower).',
    'On the router sticker (maple-leaf).',
    'On the router sticker: sunflower.',
    'On the router sticker "sunflower".',
    "On the router sticker 'sunflower'.",
    'On the router sticker “sunflower”.',
    'On the router sticker `sunflower`.',
    'On the router sticker — sunflower.',
  ])('rejects embedded credentials without a password label: %s', (text) => {
    expect(safeWifiLocation(text)).toBeNull();
    expect(safeWifiInstructions(text)).toBeNull();
    const facts = wifiInstructionsFromNotes([
      { title: 'Wi-Fi password location', body: text },
      { title: 'Wi-Fi connection instructions', body: text },
    ]);
    expect(facts.location).toBeNull();
    expect(facts.instructions).toBeNull();
    expect(wifiAnswer('What is the Wi-Fi password?', facts)).toBeNull();
  });
  it('keeps ordinary room numbers and network-band instructions unchanged', () => {
    expect(safeWifiLocation('On the card in room 2.')).toBe('On the card in room 2.');
    expect(safeWifiInstructions('Join the 5GHz network using the details on the card.'))
      .toBe('Join the 5GHz network using the details on the card.');
  });
  it.each(['On', 'In', 'Inside', 'At', 'Under', 'Beside', 'Behind', 'Near', 'Next to',
    'Printed on', 'Posted on', 'Written on', 'Located on'])(
    'keeps %s location prose, but never an appended value', (prefix) => {
      const location = `${prefix} the welcome card in the study.`;
      expect(safeWifiLocation(location)).toBe(location);
      expect(safeWifiLocation(`${prefix} the welcome card (sunflower).`)).toBeNull();
      expect(safeWifiLocation(`${prefix} the welcome card: sunflower.`)).toBeNull();
    },
  );
  it('does not mistake an incidental locative word for a location description', () => {
    expect(safeWifiLocation('sunflower is on the router sticker.')).toBeNull();
  });
  it.each(['Note on the fridge', 'A note on the fridge', 'The card in the drawer',
    'Sticker under the router', 'A label beside the desk'])(
    'preserves the explicit host artifact location: %s', (location) => {
      expect(safeWifiLocation(location)).toBe(location);
      const facts = wifiInstructionsFromNotes([{ title: 'Wi-Fi password location', body: location }]);
      expect(wifiAnswer('What is the Wi-Fi password?', facts)).toBe(`Wi-Fi password location: ${location}`);
      for (const suffix of [' (sunflower).', ' (maple-leaf).', ': sunflower.', ' "sunflower".',
        " 'sunflower'.", ' — sunflower.']) {
        expect(safeWifiLocation(location + suffix)).toBeNull();
      }
    },
  );
});
