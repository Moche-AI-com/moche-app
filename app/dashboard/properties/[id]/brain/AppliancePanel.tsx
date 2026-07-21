'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { lookupApplianceAction, saveApplianceAction, type ApplianceState } from './appliance-actions';

function LookupButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? 'Looking up…' : 'Generate guide'}
    </button>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
      {pending ? 'Saving…' : 'Save to Brain'}
    </button>
  );
}

export function AppliancePanel({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [lookupState, lookupAction] = useFormState<ApplianceState, FormData>(lookupApplianceAction, {});
  const [saveState, saveAction] = useFormState<ApplianceState, FormData>(saveApplianceAction, {});
  const [model, setModel] = useState('');
  const [guidance, setGuidance] = useState('');

  useEffect(() => {
    if (lookupState.ok && lookupState.preview) setGuidance(lookupState.preview);
  }, [lookupState]);

  useEffect(() => {
    if (saveState.ok) {
      setModel('');
      setGuidance('');
      router.refresh();
    }
  }, [saveState, router]);

  return (
    <div className="card" style={{ padding: '1rem', display: 'grid', gap: '.6rem' }}>
      <div>
        <h3 style={{ margin: 0 }}>Appliance helper</h3>
        <p className="muted" style={{ fontSize: '.85rem', margin: '.35rem 0 0' }}>
          Enter an appliance make and model. We draft guest-friendly operating and troubleshooting
          tips you can review, edit, and save to your Brain.
        </p>
      </div>

      <form action={lookupAction} style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <input type="hidden" name="propertyId" value={propertyId} />
        <input
          name="model"
          className="input"
          placeholder="e.g. Keurig K-Elite, GE Profile dishwasher PDT715SYNFS"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
          required
        />
        <LookupButton />
      </form>
      {lookupState.error && (
        <p style={{ color: 'var(--coral)', fontSize: '.85rem', margin: 0 }}>{lookupState.error}</p>
      )}

      {guidance && (
        <form action={saveAction} style={{ display: 'grid', gap: '.5rem' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="model" value={model} />
          <label style={{ fontSize: '.82rem', fontWeight: 600 }}>Draft guidance (edit freely)</label>
          <textarea
            name="guidance"
            className="textarea"
            rows={12}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
          />
          <label style={{ fontSize: '.82rem', fontWeight: 600 }}>Your own note (optional)</label>
          <textarea name="host_note" className="textarea" rows={2} placeholder="Anything specific to this unit — where it is, quirks, etc." />
          <div>
            <SaveButton />
          </div>
          {saveState.error && (
            <p style={{ color: 'var(--coral)', fontSize: '.85rem', margin: 0 }}>{saveState.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
