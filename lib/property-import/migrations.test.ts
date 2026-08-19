import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..', 'supabase', 'migrations');
const importMigration = readFileSync(resolve(root, 'supabase-migrations-PROPERTY-IMPORT.sql'), 'utf8');
const applianceMigration = readFileSync(resolve(root, 'supabase-migrations-APPLIANCES.sql'), 'utf8');

describe('new onboarding tables enforce account/property boundaries', () => {
  it('enables RLS and scopes import jobs and artifacts through account membership', () => {
    expect(importMigration).toMatch(/alter table public\.property_import_jobs enable row level security/i);
    expect(importMigration).toMatch(/property_import_jobs_select_members[\s\S]*?is_account_member\(host_account_id\)/i);
    expect(importMigration).toMatch(/property_import_artifacts_select_members[\s\S]*?property_import_jobs j[\s\S]*?is_account_member\(j\.host_account_id\)/i);
    expect(importMigration).not.toMatch(/property_import_jobs_select_members[\s\S]*?using \(true\)/i);
  });

  it('does not grant a direct guest or public policy for appliance manuals', () => {
    expect(applianceMigration).toMatch(/alter table public\.property_appliances enable row level security/i);
    expect(applianceMigration).toMatch(/appliance_manual_sections_select_members[\s\S]*?can_access_property\(property_id\)/i);
    expect(applianceMigration).not.toMatch(/to anon/i);
    expect(applianceMigration).not.toMatch(/using \(true\)/i);
  });
});
