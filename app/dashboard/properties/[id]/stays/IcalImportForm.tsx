'use client';

import { useState, useTransition } from 'react';
import { saveIcalImportAction, syncIcalNowAction, type IcalActionState } from './actions';

// iCal stay import (issue #133, item 4): paste the Airbnb/Vrbo calendar export
// URL once — stays and access codes then create themselves. The saved URL is a
// secret (it contains the platform token) and is never rendered back; the form
// only reflects connected/disconnected state.
export function IcalImportForm(props: {
  propertyId: string;
  hasFeed: boolean;
  lastSyncedAt: string | null;
}) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<IcalActionState>({});
  const [pending, startTransition] = useTransition();

  function submit(mutator: (formData: FormData) => FormData, action: (formData: FormData) => Promise<IcalActionState>) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('propertyId', props.propertyId);
      setState(await action(mutator(formData)));
    });
  }

  const save = () => submit((fd) => { fd.set('icalUrl', url); return fd; }, saveIcalImportAction);
  const disconnect = () => submit((fd) => { fd.set('icalUrl', ''); return fd; }, saveIcalImportAction);
  const syncNow = () => submit((fd) => fd, syncIcalNowAction);

  return (
    <section aria-label="Calendar sync" className="card" style={{ padding: '1.25rem', marginBottom: '1.25rem', maxWidth: 680 }}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 .35rem' }}>Calendar sync (iCal)</h2>
      <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 .75rem' }}>
        Paste your Airbnb or Vrbo calendar export URL once. New bookings then create stays and access codes automatically — no per-booking steps.
      </p>
      {props.hasFeed ? (
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '.85rem' }}>
            Connected{props.lastSyncedAt ? ` — last synced ${new Date(props.lastSyncedAt).toLocaleString()}` : ''}
          </span>
          <button type="button" className="button" onClick={syncNow} disabled={pending}>Sync now</button>
          <button type="button" className="button" onClick={disconnect} disabled={pending}>Disconnect</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '.5rem' }}>
          <input
            className="input"
            type="url"
            inputMode="url"
            aria-label="Calendar export URL"
            placeholder="https://www.airbnb.com/calendar/ical/…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            style={{ flex: 1, minHeight: 44 }}
          />
          <button type="button" className="button" onClick={save} disabled={pending || !url.trim()}>Connect</button>
        </div>
      )}
      {state.error && <p role="alert" className="error" style={{ marginTop: '.5rem' }}>{state.error}</p>}
      {state.ok && !state.error && (
        <p className="muted" role="status" style={{ marginTop: '.5rem', fontSize: '.85rem' }}>
          {typeof state.created === 'number'
            ? `Sync complete — ${state.created} new, ${state.updated ?? 0} updated, ${state.revoked ?? 0} cancelled.`
            : 'Calendar settings saved.'}
        </p>
      )}
    </section>
  );
}
