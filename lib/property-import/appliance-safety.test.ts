import { describe, expect, it } from 'vitest';
import { requiresLicensedTechnician, segmentApplianceManual } from './appliance-safety';

describe('appliance manual safety classification', () => {
  it('flags licensed electrical and gas work without an AI decision', () => {
    expect(requiresLicensedTechnician('Call a licensed electrician before servicing the high voltage panel.')).toBe(true);
    expect(requiresLicensedTechnician('Clean the lint screen after each cycle.')).toBe(false);
    expect(requiresLicensedTechnician('Inspect the water heater vent.')).toBe(true);
    expect(requiresLicensedTechnician('Do not alter structural supports.')).toBe(true);
  });

  it('preserves manual headings and carries the safety flag into sections', () => {
    const sections = segmentApplianceManual('# Cleaning\nWipe the exterior weekly.\n# Service\nA qualified technician must repair the refrigerant system.', 'https://manuals.example/model');
    expect(sections).toHaveLength(2);
    expect(sections[1]?.requiresLicensedTechnician).toBe(true);
  });
});
