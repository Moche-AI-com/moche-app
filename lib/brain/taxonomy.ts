// The single Brain taxonomy the host ever sees.
//
// THE PROBLEM THIS SOLVES
// Two taxonomies grew independently and both leaked into the UI:
//
//   field_registry.json domains  - 10 host-facing sections (+4 system). Drives the
//                                  Coverage Map, the completeness score, and the
//                                  publish gate. Ordered, labelled, versioned.
//   brain_category (pg enum)     - 11 storage buckets. Drives brain_items,
//                                  document_chunks, the match_property_chunks RPC
//                                  the guest concierge grounds on, and answer_cache.
//
// They overlap on exactly one name (`house_rules`). The Brain page consequently
// rendered two unrelated panels both titled "Coverage", and the import picker
// offered categories that had no relationship to the gaps the Coverage Map was
// asking the host to close.
//
// THE DECISION
// Registry domains are canonical for everything the host reads. `brain_category`
// survives untouched as a STORAGE detail. Migrating the enum would mean
// backfilling every brain_items and document_chunks row, re-touching the
// retrieval RPC that guest answers are grounded on, and invalidating the golden
// evals - all to change strings on a screen. This module is the seam instead.
//
// DIRECTIONALITY
// section -> category is total and lossless: every section has one correct
// storage bucket. category -> section is NOT, because `core` is a historical
// catch-all spanning connectivity, access, parking, and space details. So new and
// AI-filed rows carry their precise section in `brain_items.section`, and
// CATEGORY_FALLBACK_SECTION is only a best-effort display guess for legacy rows
// written before that column existed.

import registry from '@/field_registry.json';
import type { BrainCategory } from '@/lib/constants';
import { REGISTRY_FIELDS, type RegistryField } from './completeness';

export interface BrainSection {
  /** Registry domain_id. The canonical identifier used in URLs, params, and AI routing. */
  id: string;
  label: string;
  order: number;
  /** Where rows for this section are stored in the brain_category enum. */
  storageCategory: BrainCategory;
  /** One line of host-facing orientation. Shown as section help text, not a tooltip. */
  blurb: string;
}

interface RegistryDomain {
  domain_id: string;
  label: string;
  order: number;
  system_section: boolean;
}

const DOMAINS = registry.domains as unknown as RegistryDomain[];

/**
 * Section -> storage bucket. Deliberately hand-written rather than derived: the
 * mapping encodes a product judgement about where a guest-facing answer should be
 * retrievable from, and a generated version would silently drift when either list
 * changes. The drift guard below turns that drift into a failing test instead.
 */
const SECTION_STORAGE: Readonly<Record<string, BrainCategory>> = {
  connectivity: 'core',
  access_security: 'core',
  policies_money: 'house_rules',
  space_details: 'core',
  parking: 'core',
  amenities: 'appliances',
  local_area: 'local_recommendations',
  house_rules: 'house_rules',
  checkout: 'checkin_checkout',
  maintenance_escalation: 'emergency',
};

const SECTION_BLURB: Readonly<Record<string, string>> = {
  connectivity: 'Wi-Fi, network names, passwords, and anything a guest needs to get online.',
  access_security: 'How guests get in, door and gate codes, keys, and the backup plan when a code fails.',
  policies_money: 'Fees, deposits, cancellation, payment, and anything with money attached.',
  space_details: 'Layout, bedrooms, bathrooms, floors, square footage, and how the space is arranged.',
  parking: 'Where to park, how many spaces, permits, and street restrictions.',
  amenities: 'Pool, hot tub, grill, laundry, and the appliances guests actually operate.',
  local_area: 'The neighbourhood context your concierge needs. Individual places live in Local Recs.',
  house_rules: 'Quiet hours, smoking, pets, guests, events, and what is not allowed.',
  checkout: 'Check-out time, the checkout steps, key return, and what guests must leave behind.',
  maintenance_escalation: 'Who to call, what counts as an emergency, and how issues reach a human.',
};

/**
 * The 10 host-facing sections in registry order. System domains (`sys_*`) are
 * excluded: they hold provenance and audit rows the host never files by hand, and
 * showing them in a picker invites misfiling.
 */
export const BRAIN_SECTIONS: readonly BrainSection[] = DOMAINS
  .filter((d) => !d.system_section)
  .sort((a, b) => a.order - b.order)
  .map((d) => ({
    id: d.domain_id,
    label: d.label,
    order: d.order,
    storageCategory: SECTION_STORAGE[d.domain_id] ?? 'core',
    blurb: SECTION_BLURB[d.domain_id] ?? '',
  }));

export const BRAIN_SECTION_IDS: readonly string[] = BRAIN_SECTIONS.map((s) => s.id);

const BY_ID = new Map(BRAIN_SECTIONS.map((s) => [s.id, s]));

export function isBrainSection(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

export function brainSection(id: string): BrainSection | null {
  return BY_ID.get(id) ?? null;
}

export function sectionLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id.replace(/_/g, ' ');
}

/** Where a row for this section is stored. Falls back to `core`, never throws. */
export function storageCategoryFor(sectionId: string): BrainCategory {
  return BY_ID.get(sectionId)?.storageCategory ?? 'core';
}

/**
 * Best-effort display section for a legacy row that has no `section` value.
 *
 * `core` intentionally resolves to `space_details` rather than `connectivity`:
 * both are wrong some of the time, and a mis-slotted layout note is a cosmetic
 * problem, while a mis-slotted note surfacing under Connectivity sits next to
 * credentials and invites the host to treat it as one.
 */
const CATEGORY_FALLBACK_SECTION: Readonly<Record<BrainCategory, string>> = {
  core: 'space_details',
  checkin_checkout: 'checkout',
  house_rules: 'house_rules',
  appliances: 'amenities',
  local_recommendations: 'local_area',
  transportation: 'parking',
  emergency: 'maintenance_escalation',
  documents: 'space_details',
  product_urls: 'amenities',
  host_qa: 'space_details',
  internal_notes: 'space_details',
};

/**
 * Resolve the section a stored row belongs to. Prefers the explicit column;
 * falls back to the category guess only when the row predates it.
 */
export function resolveSection(row: { section?: string | null; category: string }): string {
  if (row.section && BY_ID.has(row.section)) return row.section;
  return CATEGORY_FALLBACK_SECTION[row.category as BrainCategory] ?? 'space_details';
}

/** Registry fields that belong to a section, in registry order. Used by the Coverage Map and Enhance Brain. */
export function fieldsInSection(sectionId: string): RegistryField[] {
  return REGISTRY_FIELDS.filter((f) => f.domain === sectionId);
}

/**
 * Sections offered to an AI extraction pass, as a compact instruction block.
 * Kept here so the prompt and the UI can never disagree about what the valid
 * destinations are - a model told about a section the UI cannot render produces
 * items the host can never find.
 */
export function sectionRoutingGuide(): string {
  return BRAIN_SECTIONS.map((s) => `- ${s.id}: ${s.blurb}`).join('\n');
}
