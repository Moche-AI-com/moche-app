import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('instruction-only registry delta', () => {
  const sql = readFileSync('supabase/migrations/20260908135705_wifi_instruction_registry.sql', 'utf8');
  it('upserts only guidance definitions without migrating credential or property data', () => {
    expect(sql).toContain("'wifi_password_location'");
    expect(sql).toContain("'wifi_connection_instructions'");
    expect(sql).toContain('ON CONFLICT (field_id) DO UPDATE');
    expect(sql).toMatch(/UPDATE public\.field_registry[\s\S]+WHERE field_id = 'wifi_password'/);
    expect(sql).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM)\s+public\.(?:brain_values|brain_items|proposed_updates)/i);
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|DELETE|ALTER|GRANT|REVOKE)\b/i);
  });
  it('preserves the existing authenticated-only registry and property-scoped value policies', () => {
    const rls = readFileSync('supabase/migrations/20260812194735_gate3_registry_and_brain_values_rls.sql', 'utf8');
    expect(rls).toContain('public.field_registry ENABLE ROW LEVEL SECURITY');
    expect(rls).toContain('ON public.field_registry FOR SELECT TO authenticated');
    expect(rls).toContain('USING (public.can_access_property(property_id))');
    expect(rls).toContain('WITH CHECK (public.can_edit_property(property_id))');
    expect(sql).not.toContain('CREATE POLICY');
  });
});
