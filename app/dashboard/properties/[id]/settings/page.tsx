import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { hasPendingLegacyTone, resolveRestrictedTopicKeys, suggestTonePreset } from '@/lib/concierge/tone';
import { getEntitlements } from '@/lib/billing/entitlements';
import { DEFAULT_MODULES, DEFAULT_CONFIDENCE_THRESHOLD, DEFAULT_GRACE_PERIOD_HOURS, DEFAULT_CONCIERGE_NAME, DEFAULT_RESPONSE_LENGTH, PLANS } from '@/lib/constants';
import { SettingsForms } from './SettingsForms';

export const dynamic = 'force-dynamic';

export default async function PropertySettingsPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.can.editProperty) {
    return (
      <div>
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>You do not have permission to edit this property.</div>
      </div>
    );
  }

  const { property } = access;
  const supabase = createClient();
  const ent = await getEntitlements(supabase, property.host_account_id);
  const planName = ent.planId ? PLANS[ent.planId].name : null;
  const { data: settings } = await supabase
    .from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, grace_period_hours, review_nudge_enabled, review_nudge_auto, review_url, modules, concierge_name, system_prompt_override, response_length, restricted_topics, restricted_topic_keys, language, is_premium_override, legacy_tone_note, legacy_tone_ack_at')
    .eq('property_id', property.id)
    .maybeSingle();

  const rawModules = (settings?.modules ?? {}) as Record<string, boolean>;
  const normalized = {
    concierge_tone: settings?.concierge_tone ?? null,
    ai_temperature: typeof settings?.ai_temperature === 'number' ? settings.ai_temperature : 0.2,
    confidence_threshold: typeof settings?.confidence_threshold === 'number' ? settings.confidence_threshold : DEFAULT_CONFIDENCE_THRESHOLD,
    grace_period_hours: typeof settings?.grace_period_hours === 'number' ? settings.grace_period_hours : DEFAULT_GRACE_PERIOD_HOURS,
    review_nudge_enabled: settings?.review_nudge_enabled ?? false,
    review_nudge_auto: settings?.review_nudge_auto ?? false,
    review_url: settings?.review_url ?? null,
    modules: { ...DEFAULT_MODULES, ...rawModules } as Record<string, boolean>,
    concierge_name: settings?.concierge_name ?? DEFAULT_CONCIERGE_NAME,
    system_prompt_override: settings?.system_prompt_override ?? null,
    response_length: (settings?.response_length ?? DEFAULT_RESPONSE_LENGTH) as string,
    restricted_topics: settings?.restricted_topics ?? null,
    restricted_topic_keys: resolveRestrictedTopicKeys(settings?.restricted_topic_keys) as string[],
    // Pending only while the host has an un-answered legacy tone note; drives the
    // confirmation banner and, until answered, the live guest prompt.
    legacy_tone_note: settings?.legacy_tone_note ?? null,
    legacy_tone_pending: hasPendingLegacyTone({
      legacyToneNote: settings?.legacy_tone_note,
      legacyToneAckAt: settings?.legacy_tone_ack_at,
    }),
    suggested_tone_preset: suggestTonePreset(settings?.legacy_tone_note) as string,
    language: settings?.language ?? 'auto',
    is_premium_override: settings?.is_premium_override ?? false,
  };

  // Premium concierge controls unlock on a paid plan OR via the per-property override.
  const premiumUnlocked = ent.conciergeCustomization || normalized.is_premium_override;

  return (
    <div>
      <div style={{ margin: '.5rem 0 1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Settings</h1>
        <p className="faint" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
          {property.display_name} — branding, concierge voice, and portal modules.
        </p>
      </div>
      <SettingsForms property={property} settings={normalized} premiumUnlocked={premiumUnlocked} reviewUnlocked={ent.reviewNudge} planName={planName} />
    </div>
  );
}
