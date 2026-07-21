import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_MODULES, DEFAULT_CONFIDENCE_THRESHOLD, DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';
import { SettingsForms } from './SettingsForms';

export const dynamic = 'force-dynamic';

export default async function PropertySettingsPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  if (!access.can.editProperty) {
    return (
      <div>
        <Link href={`/dashboard/properties/${params.id}`} className="muted" style={{ fontSize: '.85rem' }}>← Back to property</Link>
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>You do not have permission to edit this property.</div>
      </div>
    );
  }

  const { property } = access;
  const supabase = createClient();
  const { data: settings } = await supabase
    .from('property_settings')
    .select('concierge_tone, ai_temperature, confidence_threshold, grace_period_hours, review_nudge_enabled, review_nudge_auto, modules')
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
    modules: { ...DEFAULT_MODULES, ...rawModules } as Record<string, boolean>,
  };

  return (
    <div>
      <Link href={`/dashboard/properties/${property.id}`} className="muted" style={{ fontSize: '.85rem' }}>← Back to property</Link>
      <div style={{ margin: '.5rem 0 1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Settings</h1>
        <p className="faint" style={{ fontSize: '.85rem', marginTop: '.25rem' }}>
          {property.display_name} — branding, concierge voice, and portal modules.
        </p>
      </div>
      <SettingsForms property={property} settings={normalized} />
    </div>
  );
}
