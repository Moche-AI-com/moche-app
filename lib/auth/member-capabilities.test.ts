import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES,
  CAPABILITIES,
  DEFAULT_CAPABILITIES_FOR_ROLE,
  MEMBER_ROLES,
  isAllActions,
  normalizeCapabilities,
  withAllActions,
} from './member-capabilities';

describe('member invitation capability model', () => {
  it('keeps owner out of the invitable role catalogue', () => {
    expect(MEMBER_ROLES.map((role) => role.id)).toEqual([
      'co_host',
      'property_manager',
      'support',
      'maintenance',
      'cleaner',
      'viewer',
    ]);
    expect(MEMBER_ROLES.map((role) => role.id)).not.toContain('owner');
  });

  it('describes exactly the five persisted capability columns', () => {
    expect(CAPABILITIES.map((capability) => capability.key)).toEqual([
      'can_edit_brain',
      'can_reply_guests',
      'can_receive_escalations',
      'can_resolve_maintenance',
      'can_view_analytics',
    ]);
    expect(ALL_CAPABILITIES).toEqual({
      can_edit_brain: true,
      can_reply_guests: true,
      can_receive_escalations: true,
      can_resolve_maintenance: true,
      can_view_analytics: true,
    });
  });

  it('uses safe, role-appropriate presets', () => {
    expect(DEFAULT_CAPABILITIES_FOR_ROLE.co_host).toEqual(ALL_CAPABILITIES);
    expect(DEFAULT_CAPABILITIES_FOR_ROLE.property_manager).toEqual({
      can_edit_brain: true,
      can_reply_guests: true,
      can_receive_escalations: true,
      can_resolve_maintenance: true,
      can_view_analytics: false,
    });
    expect(DEFAULT_CAPABILITIES_FOR_ROLE.support).toEqual({
      can_edit_brain: false,
      can_reply_guests: true,
      can_receive_escalations: true,
      can_resolve_maintenance: false,
      can_view_analytics: false,
    });
    expect(DEFAULT_CAPABILITIES_FOR_ROLE.maintenance).toEqual({
      can_edit_brain: false,
      can_reply_guests: false,
      can_receive_escalations: false,
      can_resolve_maintenance: true,
      can_view_analytics: false,
    });
    expect(DEFAULT_CAPABILITIES_FOR_ROLE.cleaner).toEqual(
      DEFAULT_CAPABILITIES_FOR_ROLE.maintenance,
    );
    expect(DEFAULT_CAPABILITIES_FOR_ROLE.viewer).toEqual({
      can_edit_brain: false,
      can_reply_guests: false,
      can_receive_escalations: false,
      can_resolve_maintenance: false,
      can_view_analytics: false,
    });
  });

  it('recognizes complete and partial capability sets', () => {
    expect(isAllActions(ALL_CAPABILITIES)).toBe(true);
    expect(isAllActions(DEFAULT_CAPABILITIES_FOR_ROLE.support)).toBe(false);
    expect(withAllActions()).toEqual(ALL_CAPABILITIES);
    expect(isAllActions(withAllActions())).toBe(true);
  });

  it('normalizes only known booleans at the server boundary', () => {
    expect(
      normalizeCapabilities('support', {
        can_reply_guests: 'true',
        can_receive_escalations: 1,
        can_edit_brain: false,
      }),
    ).toEqual({
      can_edit_brain: false,
      can_reply_guests: true,
      can_receive_escalations: true,
      can_resolve_maintenance: false,
      can_view_analytics: false,
    });

    expect(() =>
      normalizeCapabilities('viewer', {
        can_view_analytics: true,
        can_manage_billing: true,
      }),
    ).toThrow('Unknown member capability');
  });

  it('rejects invalid roles and treats non-booleans as false', () => {
    expect(() => normalizeCapabilities('owner', {})).toThrow('Unknown invitable role');
    expect(
      normalizeCapabilities('viewer', {
        can_edit_brain: 'yes',
        can_reply_guests: null,
        can_receive_escalations: undefined,
        can_resolve_maintenance: {},
        can_view_analytics: [],
      }),
    ).toEqual({
      can_edit_brain: false,
      can_reply_guests: false,
      can_receive_escalations: false,
      can_resolve_maintenance: false,
      can_view_analytics: false,
    });
  });
});
