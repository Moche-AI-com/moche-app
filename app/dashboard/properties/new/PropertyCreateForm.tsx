'use client';

import { useFormState } from 'react-dom';
import { createPropertyAction, type PropertyFormState } from '../actions';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';

const COMMON_TZ = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Asia/Tokyo', 'Australia/Sydney',
];

export function PropertyCreateForm() {
  const [state, formAction] = useFormState<PropertyFormState, FormData>(createPropertyAction, {});
  return (
    <form action={formAction} className="card" style={{ padding: '1.5rem', maxWidth: 560 }}>
      <FormMessage error={state.error} />
      <div className="field">
        <label className="label" htmlFor="displayName">Property name *</label>
        <input className="input" id="displayName" name="displayName" maxLength={120} required placeholder="Beachside Cottage" />
      </div>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="city">City *</label>
          <input className="input" id="city" name="city" maxLength={120} required placeholder="Barcelona" />
        </div>
        <div className="field">
          <label className="label" htmlFor="region">Region / State</label>
          <input className="input" id="region" name="region" maxLength={120} placeholder="Catalonia" />
        </div>
      </div>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
        <div className="field">
          <label className="label" htmlFor="country">Country *</label>
          <input className="input" id="country" name="country" maxLength={120} required placeholder="Spain" />
        </div>
        <div className="field">
          <label className="label" htmlFor="timezone">Timezone</label>
          <select className="select" id="timezone" name="timezone" defaultValue="UTC">
            {COMMON_TZ.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="locale">Default language</label>
        <select className="select" id="locale" name="locale" defaultValue="en">
          <option value="en">English</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="pt">Português</option>
          <option value="it">Italiano</option>
        </select>
      </div>
      <SubmitButton>Create property</SubmitButton>
      <p className="faint" style={{ fontSize: '.75rem', marginTop: '.75rem' }}>
        That&apos;s all you need to launch a guest portal — you can add branding, the Brain
        knowledge base, and more after creating it. Fields marked * are required.
      </p>
    </form>
  );
}
