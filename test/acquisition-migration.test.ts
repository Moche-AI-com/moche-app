import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase-migrations-ACQUISITION.sql', import.meta.url), 'utf8');

describe('acquisition migration isolation', () => {
  it('defines all acquisition tables with property-scoped RLS', () => {
    for (const table of ['ingestion_sources', 'ingestion_artifacts', 'source_documents', 'extracted_facts']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toMatch(new RegExp(`policy .*${table}.*can_access_property\\(property_id\\)`, 's'));
    }
  });

  it('does not create guest-visible direct Brain writes from extracted content', () => {
    expect(migration).not.toMatch(/insert\s+into\s+public\.brain_items/i);
    expect(migration).toContain('proposed_updates row');
  });

  it('gives browser roles no policy that can forge source material', () => {
    expect(migration).not.toContain('ingestion_sources_insert');
    expect(migration).not.toContain('ingestion_artifacts_insert');
    expect(migration).not.toContain('source_documents_insert');
  });
});
