'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { suggestApplianceGuidanceAction, type AppliancePrefillState } from './prefill-action';
import { adoptApplianceDraftAction, type AdoptPrefillState } from './adopt-prefill-action';
import { saveSourcedApplianceAnswerAction, type SourcedAnswerState } from './sourced-answer-action';

type Choice = { id: string; name: string; model: string };

function BusyButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? busy : idle}</button>;
}

function SuggestedQuestion({
  propertyId, appliance, question, answer, sourceRef, sourceIndex,
}: { propertyId: string; appliance: Choice; question: string; answer: string; sourceRef: string; sourceIndex: number }) {
  const [state, save] = useFormState<SourcedAnswerState, FormData>(saveSourcedApplianceAnswerAction, {});
  return <form action={save} className="card" style={{ padding: '.75rem', marginBottom: '.5rem' }}>
    <input type="hidden" name="propertyId" value={propertyId} />
    <input type="hidden" name="applianceId" value={appliance.id} />
    <input type="hidden" name="expectedModel" value={appliance.model} />
    <input type="hidden" name="sourceRef" value={sourceRef} />
    <label className="field"><span className="label">Suggested question</span><input className="input" name="question" required maxLength={300} defaultValue={question} /></label>
    <label className="field"><span className="label">Suggested answer</span><textarea className="textarea" name="answer" rows={3} required maxLength={4000} defaultValue={answer} /></label>
    <p className="faint" style={{ fontSize: '.75rem' }}>Source [{sourceIndex}] · Review before saving; this remains a draft until separately approved.</p>
    <BusyButton idle="Save answer as draft" busy="Saving…" />
    {state.error && <p role="alert" className="error">{state.error}</p>}
    {state.success && <p role="status" className="success">{state.success}</p>}
  </form>;
}

export function AppliancePrefillPanel({ propertyId, appliances }: { propertyId: string; appliances: Choice[] }) {
  const [selected, setSelected] = useState(appliances[0]?.id ?? '');
  const [requestedId, setRequestedId] = useState('');
  const [activeDraftId, setActiveDraftId] = useState('');
  const [guidance, setGuidance] = useState('');
  const [suggestion, suggest] = useFormState<AppliancePrefillState, FormData>(suggestApplianceGuidanceAction, {});
  const [saveState, adopt] = useFormState<AdoptPrefillState, FormData>(adoptApplianceDraftAction, {});
  const appliance = appliances.find((item) => item.id === selected);

  useEffect(() => {
    if (suggestion.draft && requestedId === selected) {
      setGuidance(suggestion.draft.guestGuidance);
      setActiveDraftId(selected);
    }
  }, [suggestion, requestedId, selected]);

  if (appliances.length === 0) {
    return <p className="faint">Add and confirm an exact appliance model to prepare AI suggestions.</p>;
  }
  const showingDraft = activeDraftId === selected && !!suggestion.draft;
  return <section className="card" style={{ padding: '1rem', maxWidth: 900, marginBottom: '1rem' }}>
    <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Prepare appliance guidance with AI</h2>
    <p className="faint" style={{ fontSize: '.82rem' }}>Suggestions use only matching catalog or approved manual material. Review and edit everything; generating a suggestion never publishes it.</p>
    <label className="field"><span className="label">Appliance</span>
      <select className="select" value={selected} onChange={(event) => { setSelected(event.target.value); setActiveDraftId(''); setGuidance(''); }}>
        {appliances.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}
      </select>
    </label>
    <form action={suggest} onSubmit={() => setRequestedId(selected)}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="applianceId" value={selected} />
      <BusyButton idle="Suggest from matching sources" busy="Preparing…" />
    </form>
    {suggestion.error && <p role="alert" className="error">{suggestion.error}</p>}
    {showingDraft && appliance && <>
      <p className="faint" style={{ fontSize: '.8rem' }}>Source references for review:</p>
      <ul>{(suggestion.sources ?? []).map((source, index) => <li key={`${index}-${source.label}`}>
        [{index}] {source.url?.startsWith('https://')
          ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
          : source.label}
      </li>)}</ul>
      <form action={adopt}>
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="applianceId" value={selected} />
        <input type="hidden" name="expectedModel" value={appliance.model} />
        <label className="field"><span className="label">Edit guest guidance before saving</span>
          <textarea className="textarea" rows={5} maxLength={4000} name="guestGuidance" value={guidance} onChange={(event) => setGuidance(event.target.value)} />
        </label>
        <BusyButton idle="Save as unapproved draft" busy="Saving…" />
      </form>
      {saveState.error && <p role="alert" className="error">{saveState.error}</p>}
      {saveState.success && <p role="status" className="success">{saveState.success}</p>}
      {suggestion.draft!.answers.length > 0 && <>
        <h3 style={{ fontSize: '1rem' }}>Suggested common questions</h3>
        <p className="faint" style={{ fontSize: '.8rem' }}>Edit and save each answer as a sourced draft. Review it on the appliance card before approving it for guests.</p>
        {suggestion.draft!.answers.map((item, index) => <SuggestedQuestion
          key={`${selected}-${item.sourceIndex}-${index}`} propertyId={propertyId} appliance={appliance}
          question={item.question} answer={item.answer} sourceIndex={item.sourceIndex}
          sourceRef={suggestion.sources?.[item.sourceIndex]?.ref ?? ''}
        />)}
      </>}
    </>}
  </section>;
}
