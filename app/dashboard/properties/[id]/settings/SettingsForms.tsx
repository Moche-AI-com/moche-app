'use client';

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { updatePropertyAction, updatePropertySettingsAction, type PropertyFormState } from '../../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

const COMMON_TZ = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Asia/Tokyo', 'Australia/Sydney',
];

const LOCALES = [
  { v: 'en', l: 'English' }, { v: 'es', l: 'Español' }, { v: 'fr', l: 'Français' },
  { v: 'de', l: 'Deutsch' }, { v: 'pt', l: 'Português' }, { v: 'it', l: 'Italiano' },
];

const MODULE_LABELS: { key: string; label: string; hint: string }[] = [
  { key: 'chat', label: 'AI chat', hint: 'The core concierge conversation.' },
  { key: 'quick_actions', label: 'Quick actions', hint: 'One-tap WiFi, check-in, parking cards.' },
  { key: 'local_recs', label: 'Local recommendations', hint: 'Curated nearby food, coffee, and things to do.' },
  { key: 'maintenance_reports', label: 'Maintenance reports', hint: 'Let guests flag issues; opens a service request for you.' },
  { key: 'review_nudge', label: 'Review nudge', hint: 'Gently invite happy guests to leave a review.' },
  { key: 'upsell', label: 'Upsells', hint: 'Offer late checkout, mid-stay cleans, and extras.' },
];

const TONE_PRESETS = [
  { label: 'Warm & friendly', text: 'Friendly, warm, and welcoming. Use the guest\u2019s name when known, keep replies upbeat and concise, and sound like a thoughtful local host.' },
  { label: 'Polished & professional', text: 'Polished and professional. Courteous, precise, and efficient \u2014 like a boutique-hotel front desk. Avoid slang.' },
  { label: 'Casual & fun', text: 'Casual and fun. Relaxed, a little playful, and encouraging \u2014 like a friend showing them around town. Emojis are okay in moderation.' },
];

interface Property {
  id: string;
  display_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  timezone: string;
  locale: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  brand_primary: string | null;
  brand_accent: string | null;
  cover_image_url: string | null;
}

interface Settings {
  concierge_tone: string | null;
  ai_temperature: number;
  confidence_threshold: number;
  grace_period_hours: number;
  review_nudge_enabled: boolean;
  review_nudge_auto: boolean;
  modules: Record<string, boolean>;
}

export function SettingsForms({
  property,
  settings,
  conciergeCustomization,
  planName,
}: {
  property: Property;
  settings: Settings;
  conciergeCustomization: boolean;
  planName: string | null;
}) {
  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 720 }}>
      <BrandingForm property={property} />
      <ConciergeForm propertyId={property.id} settings={settings} locked={!conciergeCustomization} planName={planName} />
    </div>
  );
}

function BrandingForm({ property }: { property: Property }) {
  const [state, formAction] = useFormState<PropertyFormState, FormData>(updatePropertyAction, {});
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', marginBottom: '.35rem' }}>Property details & branding</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        Name, location, and the colors your guests see in the portal.
      </p>
      <FormMessage error={state.error} success={state.success} />
      <input type="hidden" name="propertyId" value={property.id} />

      <div className="field">
        <label className="label" htmlFor="displayName">Property name</label>
        <input className="input" id="displayName" name="displayName" maxLength={120} defaultValue={property.display_name} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="city">City</label>
          <input className="input" id="city" name="city" maxLength={120} defaultValue={property.city ?? ''} />
        </div>
        <div className="field">
          <label className="label" htmlFor="region">Region / State</label>
          <input className="input" id="region" name="region" maxLength={120} defaultValue={property.region ?? ''} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="country">Country</label>
          <input className="input" id="country" name="country" maxLength={120} defaultValue={property.country ?? ''} />
        </div>
        <div className="field">
          <label className="label" htmlFor="timezone">Timezone</label>
          <select className="select" id="timezone" name="timezone" defaultValue={property.timezone || 'UTC'}>
            {COMMON_TZ.includes(property.timezone) ? null : <option value={property.timezone}>{property.timezone}</option>}
            {COMMON_TZ.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="addressLine1">Address line 1</label>
          <input className="input" id="addressLine1" name="addressLine1" maxLength={200} defaultValue={property.address_line1 ?? ''} placeholder="12 Ocean View Rd" />
        </div>
        <div className="field">
          <label className="label" htmlFor="postalCode">Postal code</label>
          <input className="input" id="postalCode" name="postalCode" maxLength={40} defaultValue={property.postal_code ?? ''} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="addressLine2">Address line 2</label>
        <input className="input" id="addressLine2" name="addressLine2" maxLength={200} defaultValue={property.address_line2 ?? ''} placeholder="Unit / floor (optional)" />
      </div>

      <div className="field">
        <label className="label" htmlFor="locale">Default language</label>
        <select className="select" id="locale" name="locale" defaultValue={property.locale || 'en'}>
          {LOCALES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="brandPrimary">Brand color</label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="color" id="brandPrimaryPicker" defaultValue={property.brand_primary || '#33E6D4'}
              onChange={(e) => { const t = document.getElementById('brandPrimary') as HTMLInputElement | null; if (t) t.value = e.target.value; }}
              style={{ width: 42, height: 38, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }} />
            <input className="input" id="brandPrimary" name="brandPrimary" maxLength={7} defaultValue={property.brand_primary ?? ''} placeholder="#33E6D4" />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="brandAccent">Accent color</label>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="color" id="brandAccentPicker" defaultValue={property.brand_accent || '#7C6FF0'}
              onChange={(e) => { const t = document.getElementById('brandAccent') as HTMLInputElement | null; if (t) t.value = e.target.value; }}
              style={{ width: 42, height: 38, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }} />
            <input className="input" id="brandAccent" name="brandAccent" maxLength={7} defaultValue={property.brand_accent ?? ''} placeholder="#7C6FF0" />
          </div>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="coverImageUrl">Cover image URL</label>
        <input className="input" id="coverImageUrl" name="coverImageUrl" maxLength={2000} defaultValue={property.cover_image_url ?? ''} placeholder="https://… (optional hero image for the portal)" />
      </div>

      <div style={{ marginTop: '.5rem' }}>
        <SubmitButton className="btn btn-primary">Save details</SubmitButton>
      </div>
    </form>
  );
}

function ConciergeForm({ propertyId, settings, locked, planName }: { propertyId: string; settings: Settings; locked: boolean; planName: string | null }) {
  const [state, formAction] = useFormState<PropertyFormState, FormData>(updatePropertySettingsAction, {});
  const modules = settings.modules ?? {};
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Concierge behavior</h2>
        {locked ? <span className="badge badge-coral">Pro</span> : <span className="badge badge-teal">Included</span>}
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        How your AI concierge sounds and when it hands questions to you. These apply to the live guest portal.
      </p>

      {locked ? (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          <strong>Customizing your concierge is a Pro feature.</strong>{' '}
          {planName ? `You’re on ${planName}. ` : ''}Upgrade to tune tone &amp; voice, creativity, escalation sensitivity, and portal modules.{' '}
          <Link href="/dashboard/billing" className="gradient-text" style={{ fontWeight: 600 }}>See plans →</Link>
        </div>
      ) : null}

      <FormMessage error={state.error} success={state.success} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.55 : 1 }}>

      <div className="field">
        <label className="label" htmlFor="conciergeTone">Tone &amp; voice</label>
        <textarea
          className="textarea"
          id="conciergeTone"
          name="conciergeTone"
          maxLength={2000}
          rows={4}
          defaultValue={settings.concierge_tone ?? ''}
          placeholder="Describe how the concierge should sound. e.g. Warm, concise, and local — like a thoughtful host who knows the neighborhood."
        />
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
          {TONE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { const t = document.getElementById('conciergeTone') as HTMLTextAreaElement | null; if (t) t.value = p.text; }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.4rem' }}>
          Style guidance only — it never changes the facts, only the delivery. The concierge still answers strictly from your Brain.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '.5rem' }}>
        <div className="field">
          <label className="label" htmlFor="aiTemperature">
            Creativity ({(settings.ai_temperature ?? 0.2).toFixed(1)})
          </label>
          <input type="range" id="aiTemperature" name="aiTemperature" min={0} max={1} step={0.1}
            defaultValue={settings.ai_temperature ?? 0.2} style={{ width: '100%' }}
            onChange={(e) => { const l = document.getElementById('tempOut'); if (l) l.textContent = Number(e.target.value).toFixed(1); }} />
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
            Lower = precise &amp; literal. Higher = more conversational. Now: <span id="tempOut">{(settings.ai_temperature ?? 0.2).toFixed(1)}</span>
          </p>
        </div>
        <div className="field">
          <label className="label" htmlFor="confidenceThreshold">
            Escalation sensitivity ({(settings.confidence_threshold ?? 0.55).toFixed(2)})
          </label>
          <input type="range" id="confidenceThreshold" name="confidenceThreshold" min={0.2} max={0.9} step={0.05}
            defaultValue={settings.confidence_threshold ?? 0.55} style={{ width: '100%' }}
            onChange={(e) => { const l = document.getElementById('confOut'); if (l) l.textContent = Number(e.target.value).toFixed(2); }} />
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
            Higher = hand more uncertain questions to you. Now: <span id="confOut">{(settings.confidence_threshold ?? 0.55).toFixed(2)}</span>
          </p>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 260 }}>
        <label className="label" htmlFor="gracePeriodHours">Post-checkout access (hours)</label>
        <input className="input" type="number" id="gracePeriodHours" name="gracePeriodHours" min={0} max={168}
          defaultValue={settings.grace_period_hours ?? 24} />
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
          How long guests can keep using the portal after checkout.
        </p>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

      <h3 style={{ fontSize: '.95rem', marginBottom: '.6rem' }}>Portal modules</h3>
      <div style={{ display: 'grid', gap: '.6rem' }}>
        {MODULE_LABELS.map((m) => {
          const checked = modules[m.key] ?? false;
          return (
            <label key={m.key} className="card-2" style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-start', padding: '.7rem .85rem', cursor: 'pointer' }}>
              <input type="checkbox" name={`module_${m.key}`} defaultChecked={checked} style={{ marginTop: '.15rem', accentColor: 'var(--teal)', width: 16, height: 16 }} />
              <span>
                <span style={{ display: 'block', fontSize: '.9rem', fontWeight: 600 }}>{m.label}</span>
                <span className="muted" style={{ fontSize: '.78rem' }}>{m.hint}</span>
              </span>
            </label>
          );
        })}
      </div>

      </fieldset>

      <div style={{ marginTop: '1rem' }}>
        {locked ? (
          <Link href="/dashboard/billing" className="btn btn-primary">Upgrade to Pro</Link>
        ) : (
          <SubmitButton className="btn btn-primary">Save concierge settings</SubmitButton>
        )}
      </div>
    </form>
  );
}
