'use client';

import { useFormState } from 'react-dom';
import type { Tables } from '@/lib/database.types';
import { addApplianceAction, approveManualSectionAction, ingestManualAction, updateApplianceAction, type ApplianceFormState } from './actions';

type Appliance = Tables<'property_appliances'>;
type ManualSection = Tables<'appliance_manual_sections'>;
const initialState: ApplianceFormState = {};

function Message({ state }: { state: ApplianceFormState }) {
  if (state.error) return <p role="alert" className="alert alert-error">{state.error}</p>;
  if (state.success) return <p role="status" className="alert alert-success">{state.success}</p>;
  return null;
}

function ApplianceFields({ appliance, propertyId }: { appliance?: Appliance; propertyId: string }) {
  return <>
    <input type="hidden" name="propertyId" value={propertyId} />
    {appliance && <input type="hidden" name="applianceId" value={appliance.id} />}
    <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
      <label className="field"><span className="label">Appliance type *</span><input className="input" name="category" required maxLength={80} defaultValue={appliance?.category ?? ''} placeholder="Washer" /></label>
      <label className="field"><span className="label">Display name *</span><input className="input" name="displayName" required maxLength={160} defaultValue={appliance?.display_name ?? ''} placeholder="Laundry room washer" /></label>
      <label className="field"><span className="label">Brand</span><input className="input" name="brand" maxLength={120} defaultValue={appliance?.brand ?? ''} placeholder="Whirlpool" /></label>
      <label className="field"><span className="label">Exact model number</span><input className="input" name="modelNumber" maxLength={160} defaultValue={appliance?.model_number ?? ''} placeholder="WFW5605MW" /></label>
      <label className="field"><span className="label">Serial number</span><input className="input" name="serialNumber" maxLength={160} defaultValue={appliance?.serial_number ?? ''} /></label>
      <label className="field"><span className="label">Location note</span><input className="input" name="locationNote" maxLength={300} defaultValue={appliance?.location_note ?? ''} placeholder="Laundry closet" /></label>
    </div>
    <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.75rem' }}><input name="unknownModel" type="checkbox" defaultChecked={!appliance?.model_number} /> I do not know the exact model number yet</label>
    <p className="faint" style={{ margin: '.4rem 0 0', fontSize: '.8rem' }}>Check the label inside the door, on the back panel, or in the owner paperwork.</p>
  </>;
}

function AddApplianceForm({ propertyId }: { propertyId: string }) {
  const [state, formAction] = useFormState(addApplianceAction, initialState);
  return <form action={formAction} className="card" style={{ padding: '1rem' }}><h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Add an appliance</h2><ApplianceFields propertyId={propertyId} /><Message state={state} /><button className="btn btn-primary" type="submit" style={{ marginTop: '1rem' }}>Add appliance</button></form>;
}

function ApplianceEditor({ appliance, propertyId }: { appliance: Appliance; propertyId: string }) {
  const [state, formAction] = useFormState(updateApplianceAction, initialState);
  return <details className="card" style={{ padding: '1rem' }}>
    <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span><strong>{appliance.display_name}</strong><span className="faint"> · {appliance.model_number ?? 'Model unverified'}</span></span><span className="badge">{appliance.verification_status.replaceAll('_', ' ')}</span></summary>
    <p className="faint" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>Last verified: {appliance.last_verified_at ? new Date(appliance.last_verified_at).toLocaleDateString() : 'Not yet verified'}</p>
    <form action={formAction} style={{ marginTop: '1rem' }}><ApplianceFields appliance={appliance} propertyId={propertyId} /><Message state={state} /><button className="btn btn-primary" type="submit" style={{ marginTop: '1rem' }}>Save appliance</button></form>
    {appliance.model_number ? <ManualImportForm appliance={appliance} propertyId={propertyId} /> : <p className="faint" style={{ marginTop: '1rem' }}>Manual lookup is disabled until the exact model number is confirmed. This appliance can remain saved as unverified.</p>}
  </details>;
}

function ManualImportForm({ appliance, propertyId }: { appliance: Appliance; propertyId: string }) {
  const [state, formAction] = useFormState(ingestManualAction, initialState);
  return <form action={formAction} style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
    <input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="applianceId" value={appliance.id} />
    <label className="field"><span className="label">Candidate manual URL</span><input className="input" type="url" required name="manualUrl" maxLength={2000} defaultValue={appliance.manual_url ?? ''} placeholder="https://manufacturer.example/manual" /></label>
    <label style={{ display: 'flex', gap: '.5rem', alignItems: 'start', marginTop: '.75rem' }}><input type="checkbox" name="manualConfirmed" required /> I confirm this manual matches model <strong>{appliance.model_number}</strong>. It will remain review-only until I approve sections.</label>
    <Message state={state} /><button className="btn btn-primary" type="submit" style={{ marginTop: '.75rem' }}>Read candidate manual</button>
  </form>;
}

function ManualSectionCard({ section, propertyId }: { section: ManualSection; propertyId: string }) {
  const [state, formAction] = useFormState(approveManualSectionAction, initialState);
  return <article className="card" style={{ padding: '1rem' }}>
    <h3 style={{ fontSize: '1rem', marginTop: 0 }}>{section.section_title}</h3>
    {section.requires_licensed_technician && <p className="alert alert-error">Safety boundary: this section requires a licensed technician. Do not turn it into guest DIY instructions.</p>}
    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{section.body}</p>
    {section.approved_at ? <span className="badge">Approved for the Brain</span> : section.requires_licensed_technician ? <p className="faint">Keep this as an escalation note for the host or a licensed technician.</p> : <form action={formAction}><input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="sectionId" value={section.id} /><Message state={state} /><button className="btn btn-primary" type="submit">Approve section for Brain</button></form>}
  </article>;
}

export function ApplianceClient({ propertyId, appliances, sections }: { propertyId: string; appliances: Appliance[]; sections: ManualSection[] }) {
  return <div style={{ display: 'grid', gap: '1rem', maxWidth: 900 }}><p className="faint">Add every appliance you want the concierge to guide guests on. Exact model numbers unlock manual review; unknown models stay unverified and never receive guessed instructions.</p><AddApplianceForm propertyId={propertyId} /><section><h2 style={{ fontSize: '1.2rem' }}>Inventory</h2>{appliances.length ? <div style={{ display: 'grid', gap: '.75rem' }}>{appliances.map((appliance) => <ApplianceEditor key={appliance.id} appliance={appliance} propertyId={propertyId} />)}</div> : <p className="faint">No appliances yet.</p>}</section><section><h2 style={{ fontSize: '1.2rem' }}>Manual sections awaiting approval</h2>{sections.length ? <div style={{ display: 'grid', gap: '.75rem' }}>{sections.map((section) => <ManualSectionCard key={section.id} section={section} propertyId={propertyId} />)}</div> : <p className="faint">Confirm a matching manual URL to create reviewable sections.</p>}</section></div>;
}
