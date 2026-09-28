'use client';

import { useFormState } from 'react-dom';
import type { Tables } from '@/lib/database.types';
import { addApplianceAction, approveManualSectionAction, ingestManualAction, updateApplianceAction, type ApplianceFormState } from './actions';
import { CatalogSearch, CatalogSyncForm } from './CatalogSearch';
import {
  addApplianceAnswerAction, approveApplianceAnswerAction,
  approveApplianceGuidanceAction, saveApplianceGuidanceAction,
  type GuidanceActionState,
} from './guidance-actions';

type Appliance = Tables<'property_appliances'> & {
  guest_visible?: boolean;
  guest_guidance?: string | null;
  private_notes?: string | null;
  guidance_approved_at?: string | null;
};
type ManualSection = Tables<'appliance_manual_sections'>;
type Answer = {
  id: string; property_id: string; appliance_id: string; question: string; answer: string;
  status: string; approved_at: string | null; model_number_snapshot: string | null;
};
const initialState: ApplianceFormState = {};
const initialGuidance: GuidanceActionState = {};

function Message({ state }: { state: ApplianceFormState | GuidanceActionState }) {
  if (state.error) return <p role="alert" className="error">{state.error}</p>;
  if (state.success) return <p role="status" className="success">{state.success}</p>;
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
      <label className="field"><span className="label">Serial number (private)</span><input className="input" name="serialNumber" maxLength={160} defaultValue={appliance?.serial_number ?? ''} /></label>
      <label className="field"><span className="label">Location note</span><input className="input" name="locationNote" maxLength={300} defaultValue={appliance?.location_note ?? ''} placeholder="Laundry closet" /></label>
    </div>
    <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', marginTop: '.75rem' }}><input name="unknownModel" type="checkbox" defaultChecked={!appliance?.model_number} /> I do not know the exact model number yet</label>
    <p className="faint" style={{ margin: '.4rem 0 0', fontSize: '.8rem' }}>Check the label inside the door, on the back panel, or in the owner paperwork.</p>
  </>;
}

function AddApplianceForm({ propertyId }: { propertyId: string }) {
  const [state, formAction] = useFormState(addApplianceAction, initialState);
  return <form action={formAction} className="card" style={{ padding: '1rem' }}><h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Add an appliance manually</h2><ApplianceFields propertyId={propertyId} /><Message state={state} /><button className="button" type="submit" style={{ marginTop: '1rem' }}>Add appliance</button></form>;
}

function GuidanceEditor({ appliance, propertyId }: { appliance: Appliance; propertyId: string }) {
  const [saveState, save] = useFormState(saveApplianceGuidanceAction, initialGuidance);
  const [approvalState, approve] = useFormState(approveApplianceGuidanceAction, initialGuidance);
  return <section style={{ borderTop: '1px solid var(--border)', marginTop: '1rem', paddingTop: '1rem' }}>
    <h3 style={{ fontSize: '1rem' }}>Guest guidance</h3>
    <p className="faint" style={{ fontSize: '.8rem' }}>Write instructions specific to this home. Save first, then approve separately. Drafts and private notes are never guest answers.</p>
    <form action={save}>
      <input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="applianceId" value={appliance.id} />
      <label className="field"><span className="label">Instructions for guests</span>
        <textarea className="textarea" name="guestGuidance" maxLength={4000} rows={4} defaultValue={appliance.guest_guidance ?? ''} placeholder="For this washer: detergent is on the top shelf. Select Normal, then press Start." />
      </label>
      <label className="field"><span className="label">Private host notes (not sent to guests or the AI)</span>
        <textarea className="textarea" name="privateNotes" maxLength={4000} rows={3} defaultValue={appliance.private_notes ?? ''} />
      </label>
      <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}><input type="checkbox" name="guestVisible" defaultChecked={appliance.guest_visible !== false} /> Show this appliance in the guest picker</label>
      <Message state={saveState} /><button className="btn btn-ghost btn-sm" type="submit">Save draft and visibility</button>
    </form>
    {appliance.guest_guidance && <form action={approve} style={{ marginTop: '.5rem' }}>
      <input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="applianceId" value={appliance.id} />
      <Message state={approvalState} />
      <button type="submit" className="btn btn-primary btn-sm">{appliance.guidance_approved_at ? 'Reconfirm guest guidance' : 'Approve guest guidance'}</button>
    </form>}
    {appliance.guidance_approved_at && <p className="faint" style={{ fontSize: '.8rem' }}>Approved for guest questions. Editing these instructions removes approval until reviewed again.</p>}
  </section>;
}

function AnswerForm({ applianceId, propertyId }: { applianceId: string; propertyId: string }) {
  const [state, formAction] = useFormState(addApplianceAnswerAction, initialGuidance);
  return <form action={formAction} style={{ marginTop: '1rem' }}>
    <h3 style={{ fontSize: '1rem' }}>Add a common question</h3>
    <input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="applianceId" value={applianceId} />
    <label className="field"><span className="label">Guest question</span><input className="input" name="question" required maxLength={300} placeholder="How do I start the washer?" /></label>
    <label className="field"><span className="label">Your answer</span><textarea className="textarea" name="answer" rows={3} required maxLength={4000} /></label>
    <Message state={state} /><button className="btn btn-ghost btn-sm" type="submit">Save answer for review</button>
  </form>;
}

function AnswerCard({ row, propertyId }: { row: Answer; propertyId: string }) {
  const [state, approve] = useFormState(approveApplianceAnswerAction, initialGuidance);
  return <article style={{ padding: '.75rem', border: '1px solid var(--border)', borderRadius: 8 }}>
    <strong>{row.question}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{row.answer}</p>
    <span className="badge">{row.status}</span>
    {row.status === 'draft' && <form action={approve} style={{ marginTop: '.5rem' }}>
      <input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="applianceId" value={row.appliance_id} /><input type="hidden" name="answerId" value={row.id} />
      <Message state={state} /><button className="btn btn-primary btn-sm" type="submit">Approve for guests</button>
    </form>}
  </article>;
}

function ManualImportForm({ appliance, propertyId }: { appliance: Appliance; propertyId: string }) {
  const [state, formAction] = useFormState(ingestManualAction, initialState);
  return <form action={formAction} style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
    <input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="applianceId" value={appliance.id} />
    <label className="field"><span className="label">Candidate manual URL</span><input className="input" type="url" required name="manualUrl" maxLength={2000} defaultValue={appliance.manual_url ?? ''} placeholder="https://manufacturer.example/manual" /></label>
    <label style={{ display: 'flex', gap: '.5rem', alignItems: 'start', marginTop: '.75rem' }}><input type="checkbox" name="manualConfirmed" required /> I confirm this manual matches model <strong>{appliance.model_number}</strong>. It will remain review-only until I approve sections.</label>
    <Message state={state} /><button className="button" type="submit" style={{ marginTop: '.75rem' }}>Read candidate manual</button>
  </form>;
}

function ApplianceEditor({ appliance, propertyId, answers, canEdit }: { appliance: Appliance; propertyId: string; answers: Answer[]; canEdit: boolean }) {
  const [state, formAction] = useFormState(updateApplianceAction, initialState);
  return <details className="card" style={{ padding: '1rem' }}>
    <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span><strong>{appliance.display_name}</strong><span className="faint"> · {appliance.model_number ?? 'Model unverified'}</span></span><span className="badge">{appliance.verification_status.replaceAll('_', ' ')}</span></summary>
    <p className="faint" style={{ margin: '.5rem 0 0', fontSize: '.8rem' }}>Last verified: {appliance.last_verified_at ? new Date(appliance.last_verified_at).toLocaleDateString() : 'Not yet verified'}</p>
    {canEdit && <>
      <form action={formAction} style={{ marginTop: '1rem' }}><ApplianceFields appliance={appliance} propertyId={propertyId} /><Message state={state} /><button className="button" type="submit" style={{ marginTop: '1rem' }}>Save appliance</button></form>
      <GuidanceEditor appliance={appliance} propertyId={propertyId} />
      <AnswerForm applianceId={appliance.id} propertyId={propertyId} />
      {appliance.catalog_id ? <CatalogSyncForm propertyId={propertyId} applianceId={appliance.id} /> : null}
      {appliance.model_number ? <ManualImportForm appliance={appliance} propertyId={propertyId} /> : <p className="faint" style={{ marginTop: '1rem' }}>Manual lookup is disabled until the exact model number is confirmed. This appliance can remain saved as unverified.</p>}
    </>}
    <section style={{ display: 'grid', gap: '.5rem', marginTop: '1rem' }}>
      <h3 style={{ fontSize: '1rem', margin: 0 }}>Reviewed answers</h3>
      {answers.length ? answers.map((answer) => <AnswerCard key={answer.id} row={answer} propertyId={propertyId} />) : <p className="faint">No answers yet. Guests can ask, but we will not invent instructions.</p>}
    </section>
  </details>;
}

function ManualSectionCard({ section, propertyId, canEdit }: { section: ManualSection; propertyId: string; canEdit: boolean }) {
  const [state, formAction] = useFormState(approveManualSectionAction, initialState);
  return <article className="card" style={{ padding: '1rem' }}>
    <h3 style={{ fontSize: '1rem', marginTop: 0 }}>{section.section_title}</h3>
    {section.requires_licensed_technician && <p className="error">Safety boundary: this section requires a licensed technician. Do not turn it into guest DIY instructions.</p>}
    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{section.body}</p>
    {section.approved_at ? <span className="badge">Approved for the Brain</span> : section.requires_licensed_technician || !canEdit ? <p className="faint">Review-only; do not publish technician instructions.</p> : <form action={formAction}><input type="hidden" name="propertyId" value={propertyId} /><input type="hidden" name="sectionId" value={section.id} /><Message state={state} /><button className="button" type="submit">Approve section for Brain</button></form>}
  </article>;
}

export function ApplianceClient({ propertyId, appliances, sections, answers, canEdit }: { propertyId: string; appliances: Appliance[]; sections: ManualSection[]; answers: Answer[]; canEdit: boolean }) {
  return <div style={{ display: 'grid', gap: '1rem', maxWidth: 900 }}>
    <p className="faint">Search for a model to prefill its details, or add an appliance manually. Review any suggested manual content; only approved guest guidance and answers can be used for appliance questions.</p>
    {canEdit ? <><CatalogSearch propertyId={propertyId} /><AddApplianceForm propertyId={propertyId} /></> : <p className="faint">You have read-only access to this appliance inventory.</p>}
    <section><h2 style={{ fontSize: '1.2rem' }}>Inventory</h2>{appliances.length ? <div style={{ display: 'grid', gap: '.75rem' }}>{appliances.map((appliance) => <ApplianceEditor key={appliance.id} appliance={appliance} propertyId={propertyId} answers={answers.filter((answer) => answer.appliance_id === appliance.id)} canEdit={canEdit} />)}</div> : <p className="faint">No appliances yet.</p>}</section>
    <section><h2 style={{ fontSize: '1.2rem' }}>Manual sections awaiting approval</h2>{sections.length ? <div style={{ display: 'grid', gap: '.75rem' }}>{sections.map((section) => <ManualSectionCard key={section.id} section={section} propertyId={propertyId} canEdit={canEdit} />)}</div> : <p className="faint">Confirm a matching manual URL to create reviewable sections.</p>}</section>
  </div>;
}
