'use client';

import { useFormState } from 'react-dom';
import Link from 'next/link';
import { Info, Lock, Star } from 'lucide-react';
import { updatePropertyAction, updatePropertySettingsAction, updateReviewNudgeAction, resolveLegacyToneAction, type PropertyFormState } from '../../actions';
import { RESTRICTED_TOPIC_OPTIONS, TONE_PRESETS } from '@/lib/constants';
import { DEFAULT_HOST_LANGUAGE, PORTAL_LANGUAGES } from '@/lib/guest/languages';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { PropertyCoverUploader } from '@/components/PropertyCoverUploader';

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
  { key: 'extras', label: 'Extras', hint: 'Offer late checkout, mid-stay cleans, and other add-ons.' },
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
  lat: number | null;
  lng: number | null;
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
  review_url: string | null;
  modules: Record<string, boolean>;
  concierge_name: string;
  system_prompt_override: string | null;
  response_length: string;
  restricted_topics: string | null;
  restricted_topic_keys: string[];
  legacy_tone_note: string | null;
  legacy_tone_pending: boolean;
  suggested_tone_preset: string;
  language: string;
  host_language: string;
  is_premium_override: boolean;
}

const RESPONSE_LENGTH_OPTIONS = [
  { v: 'concise', l: 'Concise — 1–3 short sentences' },
  { v: 'balanced', l: 'Balanced — default' },
  { v: 'detailed', l: 'Detailed — thorough with context' },
];

const CONCIERGE_LANGUAGES = [
  { v: 'auto', l: 'Auto — match the guest' },
  { v: 'English', l: 'English' }, { v: 'Español', l: 'Español' }, { v: 'Français', l: 'Français' },
  { v: 'Deutsch', l: 'Deutsch' }, { v: 'Português', l: 'Português' }, { v: 'Italiano', l: 'Italiano' },
];

export function SettingsForms({
  property,
  settings,
  premiumUnlocked,
  reviewUnlocked,
  planName,
}: {
  property: Property;
  settings: Settings;
  premiumUnlocked: boolean;
  reviewUnlocked: boolean;
  planName: string | null;
}) {
  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 720 }}>
      <BrandingForm property={property} />
      <PropertyCoverUploader propertyId={property.id} initialUrl={property.cover_image_url} />
      {settings.legacy_tone_pending ? <LegacyToneBanner propertyId={property.id} settings={settings} /> : null}
      <ConciergeForm propertyId={property.id} settings={settings} premiumUnlocked={premiumUnlocked} planName={planName} />
      <ReviewNudgeForm propertyId={property.id} settings={settings} reviewUnlocked={reviewUnlocked} planName={planName} />
    </div>
  );
}

// Tone used to be a free text box; it is now a fixed set of presets. Any host who
// had written their own tone description keeps it driving the concierge verbatim
// until they answer this banner, so nobody's voice changes without their say.
function LegacyToneBanner({ propertyId, settings }: { propertyId: string; settings: Settings }) {
  const [state, formAction] = useFormState<PropertyFormState, FormData>(resolveLegacyToneAction, {});
  return (
    <form
      action={formAction}
      className="card"
      style={{ padding: '1.25rem', borderColor: 'var(--coral)' }}
      data-testid="legacy-tone-banner"
    >
      <input type="hidden" name="propertyId" value={propertyId} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' }}>
        <Info size={16} aria-hidden />
        <h3 style={{ fontSize: '.95rem', margin: 0 }}>Confirm your concierge tone</h3>
      </div>
      <p className="muted" style={{ fontSize: '.82rem', marginBottom: '.6rem' }}>
        Tone is now a set of presets instead of free text. Your concierge is still using
        exactly what you wrote, and nothing changes until you choose below.
      </p>
      <blockquote
        style={{
          margin: '0 0 .85rem',
          padding: '.6rem .8rem',
          borderLeft: '3px solid var(--border-strong)',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '.82rem',
        }}
        data-testid="legacy-tone-note"
      >
        {settings.legacy_tone_note}
      </blockquote>

      <div className="field">
        <label className="label" htmlFor="legacyTonePreset">Closest preset</label>
        <select
          className="select"
          id="legacyTonePreset"
          name="conciergeTone"
          defaultValue={settings.suggested_tone_preset}
          data-testid="select-legacy-tone-preset"
        >
          {TONE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{`${p.label} — ${p.description}`}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
        <SubmitButton className="btn btn-primary btn-sm" name="choice" value="keep" testId="legacy-tone-keep">
          Keep my wording as a custom instruction
        </SubmitButton>
        <SubmitButton className="btn btn-ghost btn-sm" name="choice" value="discard" testId="legacy-tone-discard">
          Just use the preset
        </SubmitButton>
      </div>
      <p className="faint" style={{ fontSize: '.72rem', marginTop: '.5rem' }}>
        Keeping it moves your wording into Custom system prompt, where free text is still allowed.
      </p>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}

function ReviewNudgeForm({ propertyId, settings, reviewUnlocked, planName }: { propertyId: string; settings: Settings; reviewUnlocked: boolean; planName: string | null }) {
  const [state, formAction] = useFormState<PropertyFormState, FormData>(updateReviewNudgeAction, {});
  const locked = !reviewUnlocked;

  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', position: 'relative' }} data-testid="review-nudge-form">
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
        <Star size={18} aria-hidden style={{ color: 'var(--iris, #c9a96e)' }} />
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Review nudge</h2>
        {locked ? (
          <span className="badge badge-coral" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
            <Lock size={12} aria-hidden /> Pro
          </span>
        ) : <span className="badge badge-teal">Included</span>}
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        Gently invite happy guests to leave a review. The nudge appears in the portal as a tasteful,
        dismissible card — only after a positive signal, and never more than once per visit.
      </p>

      <FormMessage error={state.error} success={state.success} />
      <input type="hidden" name="propertyId" value={propertyId} />

      <div style={{ position: 'relative' }}>
        {locked ? (
          <div
            data-testid="review-nudge-lock-overlay"
            style={{
              position: 'absolute', inset: 0, zIndex: 2, borderRadius: 12,
              background: 'color-mix(in srgb, var(--bg) 62%, transparent)',
              backdropFilter: 'blur(1.5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }}
          >
            <div className="card-2" style={{ textAlign: 'center', padding: '1.1rem 1.25rem', maxWidth: 360 }}>
              <Lock size={22} aria-hidden style={{ marginBottom: '.4rem' }} />
              <div style={{ fontSize: '.95rem', fontWeight: 600, marginBottom: '.25rem' }}>Upgrade to Pro to turn more happy stays into reviews</div>
              <p className="muted" style={{ fontSize: '.78rem', marginBottom: '.75rem' }}>
                {planName ? `You’re on ${planName}. ` : ''}The review nudge invites satisfied guests to leave a review at your chosen link.
              </p>
              <Link href="/dashboard/profile/billing" className="btn btn-primary btn-sm" data-testid="review-nudge-upgrade-link">Upgrade to Pro</Link>
            </div>
          </div>
        ) : null}

        <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.55 : 1 }}>
          <label className="card-2" style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-start', padding: '.7rem .85rem', cursor: 'pointer', marginBottom: '.6rem' }}>
            <input type="checkbox" name="reviewNudgeEnabled" defaultChecked={settings.review_nudge_enabled} data-testid="toggle-review-nudge-enabled" style={{ marginTop: '.15rem', accentColor: 'var(--teal)', width: 16, height: 16 }} />
            <span>
              <span style={{ display: 'block', fontSize: '.9rem', fontWeight: 600 }}>Enable review nudge</span>
              <span className="muted" style={{ fontSize: '.78rem' }}>Show the invitation card in the guest portal.</span>
            </span>
          </label>

          <label className="card-2" style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-start', padding: '.7rem .85rem', cursor: 'pointer', marginBottom: '.85rem' }}>
            <input type="checkbox" name="reviewNudgeAuto" defaultChecked={settings.review_nudge_auto} data-testid="toggle-review-nudge-auto" style={{ marginTop: '.15rem', accentColor: 'var(--teal)', width: 16, height: 16 }} />
            <span>
              <span style={{ display: 'block', fontSize: '.9rem', fontWeight: 600 }}>Surface automatically on a happy moment</span>
              <span className="muted" style={{ fontSize: '.78rem' }}>When on, the nudge appears right after a guest rates the concierge highly. When off, it stays a subtle, always-available card.</span>
            </span>
          </label>

          <div className="field">
            <label className="label" htmlFor="reviewUrl">Review link</label>
            <input className="input" id="reviewUrl" name="reviewUrl" type="url" maxLength={2000}
              defaultValue={settings.review_url ?? ''} placeholder="https://g.page/r/… or your Airbnb/VRBO review link" data-testid="input-review-url" />
            <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
              Where happy guests are sent to leave a review. The nudge only shows when this is set.
            </p>
          </div>
        </fieldset>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <SubmitButton className="btn btn-primary" testId="save-review-nudge">Save review nudge</SubmitButton>
      </div>
    </form>
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

      <AddressAutocomplete
        targets={{ line1: 'addressLine1', city: 'city', state: 'region', postalCode: 'postalCode', country: 'country' }}
        initialLat={property.lat}
        initialLng={property.lng}
        initialQuery={property.address_line1 ?? ''}
      />

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

      <div style={{ marginTop: '.5rem' }}>
        <SubmitButton className="btn btn-primary">Save details</SubmitButton>
      </div>
    </form>
  );
}

function ConciergeForm({ propertyId, settings, premiumUnlocked, planName }: { propertyId: string; settings: Settings; premiumUnlocked: boolean; planName: string | null }) {
  const [state, formAction] = useFormState<PropertyFormState, FormData>(updatePropertySettingsAction, {});
  const modules = settings.modules ?? {};
  const locked = !premiumUnlocked;

  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', position: 'relative' }} data-testid="concierge-settings-form">
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Concierge behavior</h2>
        {premiumUnlocked ? <span className="badge badge-teal">Pro unlocked</span> : <span className="badge badge-coral">Free plan</span>}
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
        How your AI concierge sounds and when it hands questions to you. These apply to the live guest portal.
      </p>

      <FormMessage error={state.error} success={state.success} />
      <input type="hidden" name="propertyId" value={propertyId} />

      {/* FREE — always editable: the three core sliders. */}
      <h3 style={{ fontSize: '.95rem', marginBottom: '.6rem' }}>Core controls</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="aiTemperature">
            Creativity ({(settings.ai_temperature ?? 0.2).toFixed(1)})
          </label>
          <input type="range" id="aiTemperature" name="aiTemperature" min={0} max={1} step={0.1}
            defaultValue={settings.ai_temperature ?? 0.2} style={{ width: '100%' }} data-testid="slider-creativity"
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
            defaultValue={settings.confidence_threshold ?? 0.55} style={{ width: '100%' }} data-testid="slider-escalation"
            onChange={(e) => { const l = document.getElementById('confOut'); if (l) l.textContent = Number(e.target.value).toFixed(2); }} />
          <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
            Higher = hand more uncertain questions to you. Now: <span id="confOut">{(settings.confidence_threshold ?? 0.55).toFixed(2)}</span>
          </p>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 320, marginTop: '.5rem' }}>
        <label className="label" htmlFor="gracePeriodHours">
          Post-checkout access ({settings.grace_period_hours ?? 24}h)
        </label>
        <input type="range" id="gracePeriodHours" name="gracePeriodHours" min={0} max={72} step={1}
          defaultValue={settings.grace_period_hours ?? 24} style={{ width: '100%' }} data-testid="slider-post-checkout"
          onChange={(e) => { const l = document.getElementById('graceOut'); if (l) l.textContent = String(e.target.value); }} />
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
          How long guests can keep using the portal after checkout. Now: <span id="graceOut">{settings.grace_period_hours ?? 24}</span>h
        </p>
      </div>

      <div className="field" style={{ marginTop: '1rem' }}>
        <label className="label" htmlFor="hostLanguage">Your language</label>
        <select
          className="select"
          id="hostLanguage"
          name="hostLanguage"
          defaultValue={settings.host_language || DEFAULT_HOST_LANGUAGE}
          data-testid="select-host-language"
        >
          {PORTAL_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeLabel === l.label ? l.label : `${l.label} — ${l.nativeLabel}`}
            </option>
          ))}
        </select>
        <p className="faint" style={{ fontSize: '.72rem', marginTop: '.4rem' }}>
          Guests can switch the portal to their own language. When they do, anything that reaches
          you — escalations, requests, notes — is translated into this language first, with the
          guest&rsquo;s original wording kept underneath.
        </p>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

      {/* PREMIUM — persona & advanced controls. Free users see it, locked. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.6rem' }}>
        <h3 style={{ fontSize: '.95rem', margin: 0 }}>Persona &amp; advanced</h3>
        {locked ? (
          <span className="badge badge-coral" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
            <Lock size={12} aria-hidden /> Pro
          </span>
        ) : <span className="badge badge-teal">Included</span>}
      </div>

      <div style={{ position: 'relative' }}>
        {locked ? (
          <div
            data-testid="premium-lock-overlay"
            style={{
              position: 'absolute', inset: 0, zIndex: 2, borderRadius: 12,
              background: 'color-mix(in srgb, var(--bg) 62%, transparent)',
              backdropFilter: 'blur(1.5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }}
          >
            <div className="card-2" style={{ textAlign: 'center', padding: '1.1rem 1.25rem', maxWidth: 360 }}>
              <Lock size={22} aria-hidden style={{ marginBottom: '.4rem' }} />
              <div style={{ fontSize: '.95rem', fontWeight: 600, marginBottom: '.25rem' }}>Upgrade to Pro to customize</div>
              <p className="muted" style={{ fontSize: '.78rem', marginBottom: '.75rem' }}>
                {planName ? `You’re on ${planName}. ` : ''}Unlock the concierge name, custom system prompt, tone &amp; language, response length, and restricted topics.
              </p>
              <Link href="/dashboard/profile/billing" className="btn btn-primary btn-sm" data-testid="premium-upgrade-link">Upgrade to Pro</Link>
            </div>
          </div>
        ) : null}

        <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0, opacity: locked ? 0.55 : 1 }}>
          <div className="field">
            <label className="label" htmlFor="conciergeName">Concierge name</label>
            <input className="input" id="conciergeName" name="conciergeName" maxLength={80}
              defaultValue={settings.concierge_name ?? ''} placeholder="Moche Concierge" data-testid="input-concierge-name" />
            <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
              The name your concierge introduces itself with.
            </p>
          </div>

          <div className="field">
            <label className="label" htmlFor="conciergeTone">Tone &amp; voice</label>
            <select
              className="select"
              id="conciergeTone"
              name="conciergeTone"
              required
              defaultValue={settings.legacy_tone_pending ? settings.suggested_tone_preset : (settings.concierge_tone || 'friendly')}
              data-testid="select-concierge-tone"
            >
              {TONE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{`${p.label} — ${p.description}`}</option>
              ))}
            </select>
            <p className="faint" style={{ fontSize: '.72rem', marginTop: '.4rem' }}>
              Style guidance only. It never changes the facts, only the delivery, and the concierge
              still answers strictly from your Brain. Need something more specific? Add it under
              Custom system prompt below.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
            <div className="field">
              <label className="label" htmlFor="conciergeLanguage">Response language</label>
              <select className="select" id="conciergeLanguage" name="language" defaultValue={settings.language || 'auto'} data-testid="select-language">
                {CONCIERGE_LANGUAGES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="responseLength">Response length</label>
              <select className="select" id="responseLength" name="responseLength" defaultValue={settings.response_length || 'balanced'} data-testid="select-response-length">
                {RESPONSE_LENGTH_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="label">Restricted topics</span>
            <p className="faint" style={{ fontSize: '.72rem', margin: '0 0 .5rem' }}>
              The concierge politely declines these and offers to pass the question to you.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '.35rem .75rem',
              }}
            >
              {RESTRICTED_TOPIC_OPTIONS.map((o) => (
                <label
                  key={o.key}
                  htmlFor={`restricted_topic_${o.key}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.5rem',
                    fontSize: '.85rem',
                    minHeight: '44px',
                    cursor: locked ? 'default' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    id={`restricted_topic_${o.key}`}
                    name={`restricted_topic_${o.key}`}
                    defaultChecked={settings.restricted_topic_keys.includes(o.key)}
                    data-testid={`check-restricted-${o.key}`}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            <div className="field" style={{ marginTop: '.6rem' }}>
              <label className="label" htmlFor="restrictedTopics" style={{ fontSize: '.78rem' }}>
                Anything else
              </label>
              <input
                className="input"
                id="restrictedTopics"
                name="restrictedTopics"
                maxLength={1000}
                defaultValue={settings.restricted_topics ?? ''}
                placeholder="e.g. the broken hot tub, the upstairs renovation"
                data-testid="input-restricted-topics"
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="systemPromptOverride">Custom system prompt</label>
            <textarea className="textarea" id="systemPromptOverride" name="systemPromptOverride" maxLength={4000} rows={5}
              defaultValue={settings.system_prompt_override ?? ''}
              placeholder="Extra instructions layered on top of the default concierge behavior. It never overrides safety rules or invents facts."
              data-testid="input-system-prompt" />
            <p className="faint" style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
              Advanced — additional guidance for scope and style. Safety guardrails always apply.
            </p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

          <h4 style={{ fontSize: '.9rem', marginBottom: '.6rem' }}>Portal modules</h4>
          <div style={{ display: 'grid', gap: '.6rem' }}>
            {MODULE_LABELS.map((m) => {
              const checked = modules[m.key] ?? false;
              return (
                <label key={m.key} className="card-2" style={{ display: 'flex', gap: '.7rem', alignItems: 'flex-start', padding: '.7rem .85rem', cursor: 'pointer' }}>
                  <input type="checkbox" name={`module_${m.key}`} defaultChecked={checked} data-testid={`module-${m.key}`} style={{ marginTop: '.15rem', accentColor: 'var(--teal)', width: 16, height: 16 }} />
                  <span>
                    <span style={{ display: 'block', fontSize: '.9rem', fontWeight: 600 }}>{m.label}</span>
                    <span className="muted" style={{ fontSize: '.78rem' }}>{m.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div style={{ marginTop: '1rem' }}>
        <SubmitButton className="btn btn-primary" testId="save-concierge-settings">Save concierge settings</SubmitButton>
      </div>
    </form>
  );
}
