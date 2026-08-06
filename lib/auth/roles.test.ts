import { describe, it, expect } from 'vitest';
import { defaultCapabilitiesForRole, isValidMemberRole, MEMBER_ROLES } from './roles';

describe('MEMBER_ROLES', () => {
  it('matches the member_role Postgres enum exactly', () => {
    expect(MEMBER_ROLES).toEqual([
      'owner',
      'co_host',
      'property_manager',
      'support',
      'maintenance',
      'cleaner',
      'viewer',
    ]);
  });
});

describe('isValidMemberRole', () => {
  it('accepts every known role', () => {
    for (const role of MEMBER_ROLES) {
      expect(isValidMemberRole(role)).toBe(true);
    }
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isValidMemberRole('super_admin')).toBe(false);
    expect(isValidMemberRole('')).toBe(false);
    expect(isValidMemberRole(null)).toBe(false);
    expect(isValidMemberRole(undefined)).toBe(false);
    expect(isValidMemberRole(42)).toBe(false);
  });
});

describe('defaultCapabilitiesForRole', () => {
  it('owner and co_host get full pre-existing capability set (unchanged behavior)', () => {
    expect(defaultCapabilitiesForRole('owner')).toEqual({
      editBrain: true,
      replyGuests: true,
      receiveEscalations: true,
      resolveMaintenance: true,
      viewAnalytics: true,
      editProperty: true,
      manageBilling: true,
      manageCoHosts: true,
    });
    expect(defaultCapabilitiesForRole('co_host')).toEqual({
      editBrain: true,
      replyGuests: true,
      receiveEscalations: true,
      resolveMaintenance: true,
      viewAnalytics: true,
      editProperty: false,
      manageBilling: false,
      manageCoHosts: false,
    });
  });

  it('property_manager gets operating actions but not analytics by default', () => {
    const pm = defaultCapabilitiesForRole('property_manager');
    expect(pm.editBrain).toBe(true);
    expect(pm.replyGuests).toBe(true);
    expect(pm.receiveEscalations).toBe(true);
    expect(pm.resolveMaintenance).toBe(true);
    expect(pm.viewAnalytics).toBe(false);
    expect(pm.editProperty).toBe(false);
    expect(pm.manageBilling).toBe(false);
    expect(pm.manageCoHosts).toBe(false);
  });

  it('maintenance can only resolve maintenance -- no brain, guest, or analytics access', () => {
    expect(defaultCapabilitiesForRole('maintenance')).toEqual({
      editBrain: false,
      replyGuests: false,
      receiveEscalations: false,
      resolveMaintenance: true,
      viewAnalytics: false,
      editProperty: false,
      manageBilling: false,
      manageCoHosts: false,
    });
  });

  it('cleaner mirrors maintenance scope', () => {
    expect(defaultCapabilitiesForRole('cleaner')).toEqual(defaultCapabilitiesForRole('maintenance'));
  });

  it('viewer is read-only with no action enabled', () => {
    const viewer = defaultCapabilitiesForRole('viewer');
    const trueKeys = Object.entries(viewer).filter(([, v]) => v).map(([k]) => k);
    expect(trueKeys).toEqual([]);
  });

  it('support can reply to guests and receive escalations only', () => {
    expect(defaultCapabilitiesForRole('support')).toEqual({
      editBrain: false,
      replyGuests: true,
      receiveEscalations: true,
      resolveMaintenance: false,
      viewAnalytics: false,
      editProperty: false,
      manageBilling: false,
      manageCoHosts: false,
    });
  });

  it('no preset role can manageBilling, manageCoHosts, or editProperty except owner', () => {
    for (const role of MEMBER_ROLES) {
      if (role === 'owner') continue;
      const caps = defaultCapabilitiesForRole(role);
      expect(caps.manageBilling).toBe(false);
      expect(caps.manageCoHosts).toBe(false);
      expect(caps.editProperty).toBe(false);
    }
  });
});
