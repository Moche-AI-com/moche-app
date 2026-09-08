-- Instruction-only Wi-Fi collection. Metadata only: no property values or
-- credentials are read, copied, or reclassified. Existing RLS and grants remain.
-- Human approval is still required before a proposed value becomes Brain truth.
BEGIN;

INSERT INTO public.field_registry (
  field_id, label, domain, system_section, type, enum_values,
  sensitivity_tier, default_audience, phase, ttl_days,
  storage_table, storage_column, storage_vault, gap_weight, hard_block,
  applicability, requires_on_failure, on_failure_field, scrape_hint,
  interview_prompt, registry_version
) VALUES
(
  'wifi_password_location', 'Wi-Fi password location', 'connectivity', false, 'text', NULL,
  'public_guest', 'guest_prearrival', ARRAY['pre-arrival', 'check-in', 'mid-stay'], 180,
  'brain_values', 'value', false, 3.0, true, 'has_wifi', false, NULL, NULL,
  'Where can guests find the Wi-Fi password? Give the exact location. Do not enter the password itself.', 1
),
(
  'wifi_connection_instructions', 'Wi-Fi connection instructions', 'connectivity', false, 'text', NULL,
  'public_guest', 'guest_prearrival', ARRAY['pre-arrival', 'check-in', 'mid-stay'], 180,
  'brain_values', 'value', false, 1.0, false, 'has_wifi', false, NULL, NULL,
  'What steps should guests follow to connect to Wi-Fi? Refer to the password location; never include the password.', 1
)
ON CONFLICT (field_id) DO UPDATE SET
  label = EXCLUDED.label,
  domain = EXCLUDED.domain,
  system_section = EXCLUDED.system_section,
  type = EXCLUDED.type,
  enum_values = EXCLUDED.enum_values,
  sensitivity_tier = EXCLUDED.sensitivity_tier,
  default_audience = EXCLUDED.default_audience,
  phase = EXCLUDED.phase,
  ttl_days = EXCLUDED.ttl_days,
  storage_table = EXCLUDED.storage_table,
  storage_column = EXCLUDED.storage_column,
  storage_vault = EXCLUDED.storage_vault,
  gap_weight = EXCLUDED.gap_weight,
  hard_block = EXCLUDED.hard_block,
  applicability = EXCLUDED.applicability,
  requires_on_failure = EXCLUDED.requires_on_failure,
  on_failure_field = EXCLUDED.on_failure_field,
  scrape_hint = EXCLUDED.scrape_hint,
  interview_prompt = EXCLUDED.interview_prompt,
  registry_version = EXCLUDED.registry_version;

-- Retain the legacy secret/vault designation and every stored secret reference.
-- It is no longer a completion gap or a publish blocker.
UPDATE public.field_registry
SET gap_weight = 0,
    hard_block = false,
    interview_prompt = 'Legacy credential field. Do not enter a password; use password location and connection instructions.'
WHERE field_id = 'wifi_password';

COMMIT;
