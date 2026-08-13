import { describe, expect, it } from 'vitest';
import registry from '@/field_registry.json';
import { BRAIN_CATEGORY_LABELS, type BrainCategory } from '@/lib/constants';
import {
  BRAIN_SECTIONS,
  BRAIN_SECTION_IDS,
  brainSection,
  fieldsInSection,
  isBrainSection,
  resolveSection,
  sectionLabel,
  sectionRoutingGuide,
  storageCategoryFor,
} from './taxonomy';

const HOST_FACING_DOMAINS = (registry.domains as unknown as { domain_id: string; system_section: boolean }[])
  .filter((d) => !d.system_section)
  .map((d) => d.domain_id);

describe('brain taxonomy', () => {
  it('exposes exactly the host-facing registry domains', () => {
    expect([...BRAIN_SECTION_IDS].sort()).toEqual([...HOST_FACING_DOMAINS].sort());
  });

  it('excludes system domains from the host-facing picker', () => {
    for (const id of BRAIN_SECTION_IDS) expect(id.startsWith('sys_')).toBe(false);
  });

  it('orders sections by the registry order field, not alphabetically', () => {
    const orders = BRAIN_SECTIONS.map((s) => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(BRAIN_SECTIONS[0].id).toBe('connectivity');
  });

  // Drift guards. SECTION_STORAGE and SECTION_BLURB are hand-written; without
  // these a new registry domain would silently land in `core` with no blurb.
  it('gives every section a storage category that is a real brain_category', () => {
    const valid = new Set(Object.keys(BRAIN_CATEGORY_LABELS) as BrainCategory[]);
    for (const section of BRAIN_SECTIONS) {
      expect(valid.has(section.storageCategory), `${section.id} -> ${section.storageCategory}`).toBe(true);
    }
  });

  it('gives every section a non-empty blurb', () => {
    for (const section of BRAIN_SECTIONS) {
      expect(section.blurb.length, `${section.id} has no blurb`).toBeGreaterThan(0);
    }
  });

  it('gives every section at least one registry field to score', () => {
    for (const section of BRAIN_SECTIONS) {
      expect(fieldsInSection(section.id).length, `${section.id} has no fields`).toBeGreaterThan(0);
    }
  });

  it('routes credentials and access to different sections', () => {
    // Regression guard for the concierge leak class of bug: Wi-Fi credentials and
    // door codes must not collapse into one bucket the host reasons about as a unit.
    expect(storageCategoryFor('connectivity')).toBe('core');
    expect(brainSection('connectivity')?.label).toBe('Connectivity');
    expect(brainSection('access_security')?.label).toBe('Access & Security');
  });

  describe('resolveSection', () => {
    it('prefers the explicit section column', () => {
      expect(resolveSection({ section: 'parking', category: 'core' })).toBe('parking');
    });

    it('falls back to a category guess for legacy rows', () => {
      expect(resolveSection({ section: null, category: 'local_recommendations' })).toBe('local_area');
      expect(resolveSection({ category: 'checkin_checkout' })).toBe('checkout');
      expect(resolveSection({ category: 'emergency' })).toBe('maintenance_escalation');
    });

    it('never resolves the core catch-all into connectivity', () => {
      // A mis-slotted layout note next to credentials invites the host to treat it
      // as sensitive; a mis-slotted note under Space Details is merely cosmetic.
      expect(resolveSection({ section: null, category: 'core' })).not.toBe('connectivity');
    });

    it('ignores a section value that is not a real section', () => {
      expect(resolveSection({ section: 'not_a_domain', category: 'house_rules' })).toBe('house_rules');
    });

    it('resolves every brain_category to a real section', () => {
      for (const category of Object.keys(BRAIN_CATEGORY_LABELS) as BrainCategory[]) {
        const resolved = resolveSection({ category });
        expect(isBrainSection(resolved), `${category} -> ${resolved}`).toBe(true);
      }
    });
  });

  describe('isBrainSection', () => {
    it('accepts real sections and rejects everything else', () => {
      expect(isBrainSection('house_rules')).toBe(true);
      expect(isBrainSection('sys_provenance_audit')).toBe(false);
      expect(isBrainSection('core')).toBe(false);
      expect(isBrainSection(null)).toBe(false);
      expect(isBrainSection(42)).toBe(false);
    });
  });

  describe('sectionLabel', () => {
    it('humanizes an unknown id instead of throwing', () => {
      expect(sectionLabel('made_up_thing')).toBe('made up thing');
    });
  });

  describe('sectionRoutingGuide', () => {
    it('lists every section so the prompt and the UI cannot disagree', () => {
      const guide = sectionRoutingGuide();
      for (const id of BRAIN_SECTION_IDS) expect(guide).toContain(`- ${id}:`);
      expect(guide).not.toContain('sys_');
    });
  });
});
