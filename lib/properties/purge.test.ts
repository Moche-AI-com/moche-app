import { describe, it, expect } from 'vitest';
import { isDeleteConfirmed, DELETE_CONFIRMATION_WORD, PURGED_TABLES, RETAINED_TABLES } from './purge';

describe('DELETE_CONFIRMATION_WORD', () => {
  it('is the literal word the UI asks the host to type', () => {
    // If this ever changes, the dialog copy and the server check must change
    // together — both read this constant, and this test is the tripwire.
    expect(DELETE_CONFIRMATION_WORD).toBe('delete');
  });
});

describe('isDeleteConfirmed', () => {
  it('accepts the exact word', () => {
    expect(isDeleteConfirmed('delete')).toBe(true);
  });

  it('accepts the forgiving variants mobile keyboards produce', () => {
    // Autocapitalisation and a trailing autocomplete space are keyboard
    // behaviour, not hesitation from the host.
    expect(isDeleteConfirmed('Delete')).toBe(true);
    expect(isDeleteConfirmed('DELETE')).toBe(true);
    expect(isDeleteConfirmed('delete ')).toBe(true);
    expect(isDeleteConfirmed('  delete  ')).toBe(true);
  });

  it('rejects anything that is not just the word', () => {
    expect(isDeleteConfirmed('delete it')).toBe(false);
    expect(isDeleteConfirmed('please delete')).toBe(false);
    expect(isDeleteConfirmed('del')).toBe(false);
    expect(isDeleteConfirmed('deleted')).toBe(false);
    expect(isDeleteConfirmed('remove')).toBe(false);
  });

  it('rejects empty and non-string input', () => {
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed('   ')).toBe(false);
    expect(isDeleteConfirmed(null)).toBe(false);
    expect(isDeleteConfirmed(undefined)).toBe(false);
    // A multi-valued form field arrives as something other than a string; it
    // must never be coerced into a passing confirmation.
    expect(isDeleteConfirmed(['delete'] as unknown as string)).toBe(false);
  });
});

/**
 * Every table carrying a `property_id` foreign key, captured from the live
 * database. A permanent delete has to make a deliberate decision about each one:
 * erase it, or keep it and say why.
 *
 * When a migration adds a property-scoped table, add it here AND to either
 * PURGED_TABLES or RETAINED_TABLES. That is the point of this test — the failure
 * mode it prevents is a new table quietly surviving every purge because nobody
 * remembered the delete path existed.
 */
const PROPERTY_LINKED_TABLES = [
  'ai_usage',
  'answer_cache',
  'audit_logs',
  'brain_items',
  'conversations',
  'document_chunks',
  'documents',
  'escalations',
  'extras_orders',
  'guest_access_links',
  'guest_access_sessions',
  'guest_extras',
  'guest_identities',
  'guest_verifications',
  'ingestion_jobs',
  'message_feedback',
  'messages',
  'nearby_places',
  'notifications',
  'product_feedback',
  'property_brain_versions',
  'property_contacts',
  'property_knowledge_nodes',
  'property_members',
  'property_settings',
  'proposed_updates',
  'recommendations',
  'service_requests',
  'stays',
] as const;

describe('purge table coverage', () => {
  it('decides the fate of every property-linked table exactly once', () => {
    const purged = new Set<string>(PURGED_TABLES);
    const retained = new Set<string>(RETAINED_TABLES);

    const undecided = PROPERTY_LINKED_TABLES.filter((t) => !purged.has(t) && !retained.has(t));
    expect(undecided, 'tables with no purge decision').toEqual([]);

    const both = PROPERTY_LINKED_TABLES.filter((t) => purged.has(t) && retained.has(t));
    expect(both, 'tables listed as both purged and retained').toEqual([]);
  });

  it('lists no table that is not actually property-linked', () => {
    const known = new Set<string>(PROPERTY_LINKED_TABLES);
    const stray = [...PURGED_TABLES, ...RETAINED_TABLES].filter((t) => !known.has(t));
    expect(stray, 'tables in the purge lists with no property_id foreign key').toEqual([]);
  });

  it('keeps the three tables Reports is built from', () => {
    // The host explicitly chose "purge, but keep my reports". These three are
    // what Reports reads; erasing any of them silently breaks that promise.
    expect(RETAINED_TABLES).toContain('service_requests');
    expect(RETAINED_TABLES).toContain('extras_orders');
    expect(RETAINED_TABLES).toContain('stays');
  });

  it('keeps the records that are not the host\u2019s to erase', () => {
    // Audit trail, metered usage behind invoices, and product feedback. All
    // reference the property with `on delete set null` for this reason.
    expect(RETAINED_TABLES).toContain('audit_logs');
    expect(RETAINED_TABLES).toContain('ai_usage');
    expect(RETAINED_TABLES).toContain('product_feedback');
  });

  it('erases the knowledge base and the guest conversation surface', () => {
    // The whole point of the feature. If any of these ever moves to the retained
    // list, "deleted for good" has become false.
    for (const table of [
      'brain_items',
      'documents',
      'document_chunks',
      'property_knowledge_nodes',
      'conversations',
      'messages',
      'guest_identities',
      'guest_verifications',
      'guest_access_sessions',
      'guest_access_links',
      'property_settings',
    ]) {
      expect(PURGED_TABLES, `${table} must be purged`).toContain(table);
    }
  });

  it('purges children before their parents', () => {
    const order = PURGED_TABLES as readonly string[];
    const before = (child: string, parent: string) => {
      const c = order.indexOf(child);
      const p = order.indexOf(parent);
      expect(c, `${child} missing from purge order`).toBeGreaterThanOrEqual(0);
      expect(p, `${parent} missing from purge order`).toBeGreaterThanOrEqual(0);
      expect(c, `${child} must be purged before ${parent}`).toBeLessThan(p);
    };
    before('message_feedback', 'messages');
    before('messages', 'conversations');
    before('document_chunks', 'documents');
    before('guest_access_sessions', 'guest_identities');
  });
});
