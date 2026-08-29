'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ImportedReviewGroup } from '@/lib/property-import/extract';
import { updatePropertyAddressAction } from '../../../actions';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { GapInterview } from './GapInterview';
import { FeatureChecklist } from './FeatureChecklist';

// Current address/location fields of the draft property, used to pre-fill the
// address card (and to skip the requirement when it was already captured).
interface PropertyAddress {
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

export function ImportReviewClient({ jobId, propertyId, groups, initialAddress }: { jobId: string; propertyId: string; groups: ImportedReviewGroup[]; initialAddress: PropertyAddress | null }) {
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, { title: string; text: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(!!initialAddress?.address_line1?.trim());
  const [addressError, setAddressError] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);

  async function acceptGroup(group: ImportedReviewGroup) {
    setError(null); setWorking(group.key);
    const edited = edits[group.key] ?? { title: group.title, text: group.text };
    try {
      const response = await fetch(`/api/property-imports/${jobId}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ group: group.key, ...edited }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? 'Could not save this group.');
      setAccepted((current) => ({ ...current, [group.key]: true }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this group.'); }
    finally { setWorking(null); }
  }

  // The import job created this property from the listing title alone, so the
  // review step is where the required main address is captured before the host
  // continues on to the property dashboard.
  async function saveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddressError(null);
    setSavingAddress(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set('propertyId', propertyId);
      const result = await updatePropertyAddressAction({}, formData);
      if (result?.error) throw new Error(result.error);
      setAddressSaved(true);
    } catch (caught) {
      setAddressError(caught instanceof Error ? caught.message : 'Could not save the address.');
    } finally {
      setSavingAddress(false);
    }
  }

  return <div style={{ display: 'grid', gap: '1rem', maxWidth: 820 }}>
    <p className="faint">Nothing was added to your Brain automatically. Review each group and accept only what is correct.</p>

    <details className="card" open style={{ padding: '1rem' }}>
      <summary style={{ cursor: 'pointer' }}>
        <strong>Property address</strong> {addressSaved ? <span className="badge">Saved</span> : <span className="badge">Required</span>}
      </summary>
      <form onSubmit={saveAddress} style={{ marginTop: '.75rem' }}>
        <p className="faint" style={{ marginTop: 0 }}>
          The import only reads your listing&apos;s details — it never captures the street address.
          Add it here: it shows on your Properties tab and powers guest directions and local answers.
        </p>
        <label className="field"><span className="label">Street address *</span><input className="input" id="reviewAddressLine1" name="addressLine1" required maxLength={200} defaultValue={initialAddress?.address_line1 ?? ''} placeholder="12 Ocean View Rd" /></label>
        <label className="field"><span className="label">Unit / apartment</span><input className="input" id="reviewAddressLine2" name="addressLine2" maxLength={200} defaultValue={initialAddress?.address_line2 ?? ''} placeholder="Unit 2 (optional)" /></label>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
          <label className="field"><span className="label">City *</span><input className="input" id="reviewCity" name="city" required maxLength={120} defaultValue={initialAddress?.city ?? ''} /></label>
          <label className="field"><span className="label">Region / State</span><input className="input" id="reviewRegion" name="region" maxLength={120} defaultValue={initialAddress?.region ?? ''} /></label>
        </div>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
          <label className="field"><span className="label">Postal code</span><input className="input" id="reviewPostalCode" name="postalCode" maxLength={40} defaultValue={initialAddress?.postal_code ?? ''} /></label>
          <label className="field"><span className="label">Country *</span><input className="input" id="reviewCountry" name="country" required maxLength={120} defaultValue={initialAddress?.country ?? ''} /></label>
        </div>
        <AddressAutocomplete
          targets={{ line1: 'reviewAddressLine1', city: 'reviewCity', state: 'reviewRegion', postalCode: 'reviewPostalCode', country: 'reviewCountry' }}
          initialLat={initialAddress?.lat ?? null}
          initialLng={initialAddress?.lng ?? null}
          showMap={false}
        />
        {addressError && <p role="alert" className="error">{addressError}</p>}
        <button className="button" type="submit" disabled={savingAddress}>{savingAddress ? 'Saving…' : addressSaved ? 'Update address' : 'Save address'}</button>
      </form>
    </details>

    {error && <p role="alert" className="error">{error}</p>}
    {groups.map((group) => {
      const edited = edits[group.key] ?? { title: group.title, text: group.text };
      return <details className="card" key={group.key} open style={{ padding: '1rem' }}>
        <summary style={{ cursor: 'pointer' }}><strong>{group.label}</strong></summary>
        <div style={{ marginTop: '.75rem' }}>
          <p className="faint" style={{ marginTop: 0 }}>From your Airbnb listing</p>
          {group.detected ? <>
            <label className="field"><span className="label">Title</span><input className="input" value={edited.title} onChange={(event) => setEdits((current) => ({ ...current, [group.key]: { ...edited, title: event.target.value } }))} /></label>
            <label className="field"><span className="label">Review and edit</span><textarea className="input" rows={6} value={edited.text} onChange={(event) => setEdits((current) => ({ ...current, [group.key]: { ...edited, text: event.target.value } }))} /></label>
            {accepted[group.key] ? <span className="badge">Added to Brain</span> : <button className="button" type="button" onClick={() => acceptGroup(group)} disabled={working !== null}>{working === group.key ? 'Saving…' : 'Accept'}</button>}
          </> : <p className="faint">No reliable details were detected here. Add these later when you have them.</p>}
        </div>
      </details>;
    })}
    <GapInterview jobId={jobId} />
    {/* What this place has — after the gap interview, before the host leaves the
        review flow (2026-08-28). Taps create Brain feature sections. */}
    <FeatureChecklist propertyId={propertyId} />
    <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
      {addressSaved ? (
        <Link className="button" href={`/dashboard/properties/${propertyId}`}>Continue to property</Link>
      ) : (
        <span className="faint" style={{ fontSize: '.85rem' }}>Save the property address above, then continue to your property.</span>
      )}
      <Link href={`/dashboard/properties/${propertyId}/appliances`}>Add appliances</Link>
    </div>
  </div>;
}
