'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Circle, Eye, Link2, ListChecks, Upload, WandSparkles } from 'lucide-react';

type PropertySummary = { id: string; name: string; slug: string; status: string };
type SourcePath = 'paste' | 'url' | 'manual' | 'portfolio';

const SOURCE_OPTIONS: { id: SourcePath; title: string; body: string; Icon: typeof Upload }[] = [
  { id: 'paste', title: 'Paste listing text', body: 'Fastest and most reliable. Copy the description and details from your listing.', Icon: ListChecks },
  { id: 'url', title: 'Import a listing link', body: 'We will do our best to read the page. You will review everything before it becomes guest-facing.', Icon: Link2 },
  { id: 'manual', title: 'Start manually', body: 'Best for a new property or one that is not listed yet.', Icon: WandSparkles },
  { id: 'portfolio', title: 'I manage several properties', body: 'Start with one representative property, then reuse its structure for the rest.', Icon: Upload },
];

export function ActivationJourney(props: {
  firstName: string | null;
  profileComplete: boolean;
  property: PropertySummary | null;
  addressComplete: boolean;
  brainCount: number;
  stayCount: number;
  accessCount: number;
}) {
  const [sourcePath, setSourcePath] = useState<SourcePath>('paste');
  const [previewConfirmed, setPreviewConfirmed] = useState(false);

  useEffect(() => {
    if (!props.property) return;
    try { setPreviewConfirmed(window.localStorage.getItem(`moche:activation:preview:${props.property.id}`) === '1'); } catch { /* Best effort. */ }
  }, [props.property]);

  function confirmPreview() {
    setPreviewConfirmed(true);
    if (!props.property) return;
    try { window.localStorage.setItem(`moche:activation:preview:${props.property.id}`, '1'); } catch { /* Best effort. */ }
  }

  const propertyCreated = !!props.property;
  const essentialsReady = propertyCreated && props.profileComplete && props.addressComplete && props.brainCount > 0;
  const live = props.property?.status === 'live';
  const guestAccessReady = live && props.stayCount > 0 && props.accessCount > 0;
  const complete = propertyCreated && essentialsReady && previewConfirmed && guestAccessReady;

  const steps = useMemo(() => [
    { title: 'Create your account', done: true },
    { title: 'Add your first property', done: propertyCreated },
    { title: 'Verify the essentials', done: essentialsReady },
    { title: 'Test the concierge', done: previewConfirmed },
    { title: 'Activate your first guest', done: guestAccessReady },
  ], [propertyCreated, essentialsReady, previewConfirmed, guestAccessReady]);
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <main className="wrap" style={{ maxWidth: 920, paddingTop: '2rem', paddingBottom: '4rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <span className="badge badge-teal">First-property activation</span>
        <h1 style={{ margin: '.65rem 0 .45rem', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)' }}>{props.firstName ? `${props.firstName}, get your first concierge working.` : 'Get your first concierge working.'}</h1>
        <p className="muted" style={{ maxWidth: 680, lineHeight: 1.6, margin: 0 }}>One guided path from property details to a tested guest portal and the first guest access link. Leave at any point and resume without losing progress.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginTop: '1rem' }}>
          <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }} aria-hidden><div style={{ width: `${Math.round((doneCount / steps.length) * 100)}%`, height: '100%', background: 'var(--grad)', transition: 'width .25s ease' }} /></div>
          <span className="muted" style={{ fontSize: '.82rem', fontVariantNumeric: 'tabular-nums' }}>{doneCount} of {steps.length}</span>
        </div>
      </header>

      {complete ? (
        <section className="card" style={{ padding: '1.5rem', borderColor: 'var(--teal)' }}>
          <Check size={30} aria-hidden style={{ color: 'var(--teal)' }} />
          <h2 style={{ margin: '.6rem 0 .35rem' }}>Your concierge is activated</h2>
          <p className="muted">{props.property?.name} is live, tested, and has guest access ready to share.</p>
          <Link href={`/dashboard/properties/${props.property?.id}`} className="btn btn-primary">Open property <ArrowRight size={15} aria-hidden /></Link>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {!propertyCreated && (
            <section className="card" style={{ padding: '1.4rem' }} aria-labelledby="activation-source">
              <span className="badge">Step 1</span>
              <h2 id="activation-source" style={{ margin: '.55rem 0 .3rem' }}>How do you manage this property today?</h2>
              <p className="muted" style={{ marginTop: 0 }}>Choose the quickest starting point. All paths create the same editable draft portal.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '.7rem' }}>
                {SOURCE_OPTIONS.map(({ id, title, body, Icon }) => (
                  <button key={id} type="button" className="card-2" aria-pressed={sourcePath === id} onClick={() => setSourcePath(id)} style={{ textAlign: 'left', padding: '1rem', cursor: 'pointer', color: 'inherit', borderColor: sourcePath === id ? 'var(--teal)' : undefined }}>
                    <Icon size={18} aria-hidden style={{ color: 'var(--teal)', marginBottom: '.45rem' }} />
                    <strong style={{ display: 'block', marginBottom: '.25rem' }}>{title}</strong>
                    <span className="muted" style={{ fontSize: '.82rem', lineHeight: 1.45 }}>{body}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: '1rem' }}><Link href="/dashboard/properties/new" className="btn btn-primary">{sourcePath === 'paste' ? 'Continue with pasted text' : sourcePath === 'url' ? 'Continue with a listing link' : sourcePath === 'manual' ? 'Start manually' : 'Set up the first portfolio property'} <ArrowRight size={15} aria-hidden /></Link></div>
            </section>
          )}

          {propertyCreated && !essentialsReady && props.property && (
            <section className="card" style={{ padding: '1.4rem' }}>
              <span className="badge">Step 2</span>
              <h2 style={{ margin: '.55rem 0 .3rem' }}>Verify only the essentials</h2>
              <p className="muted" style={{ marginTop: 0 }}>Complete only what is required to identify the property, answer safely, and hand uncertain questions to a person.</p>
              <div style={{ display: 'grid', gap: '.55rem', marginBottom: '1rem' }}>
                <StatusLine done={props.profileComplete} label="Host name and escalation contact" />
                <StatusLine done={props.addressComplete} label="Property address" />
                <StatusLine done={props.brainCount > 0} label="At least one verified Property Brain answer" />
              </div>
              {!props.profileComplete ? <Link href="/dashboard/profile/details" className="btn btn-primary">Add contact details <ArrowRight size={15} aria-hidden /></Link> : !props.addressComplete ? <Link href={`/dashboard/properties/${props.property.id}/settings`} className="btn btn-primary">Add property address <ArrowRight size={15} aria-hidden /></Link> : <Link href={`/dashboard/properties/${props.property.id}/brain`} className="btn btn-primary">Add essential answers <ArrowRight size={15} aria-hidden /></Link>}
            </section>
          )}

          {propertyCreated && essentialsReady && !previewConfirmed && props.property && (
            <section className="card" style={{ padding: '1.4rem' }}>
              <span className="badge">Step 3</span>
              <h2 style={{ margin: '.55rem 0 .3rem' }}>Test the real guest experience</h2>
              <p className="muted" style={{ marginTop: 0 }}>Open the sandboxed portal and ask three questions: check-in, Wi-Fi, and checkout. Nothing in preview is saved or sent to guests.</p>
              <div style={{ display: 'flex', gap: '.55rem', flexWrap: 'wrap' }}>
                <Link href={`/g/${props.property.slug}`} target="_blank" rel="noreferrer" className="btn btn-primary"><Eye size={15} aria-hidden /> Open guest preview</Link>
                <button type="button" className="btn btn-ghost" onClick={confirmPreview}>I tested the answers</button>
              </div>
            </section>
          )}

          {propertyCreated && essentialsReady && previewConfirmed && !guestAccessReady && props.property && (
            <section className="card" style={{ padding: '1.4rem' }}>
              <span className="badge">Step 4</span>
              <h2 style={{ margin: '.55rem 0 .3rem' }}>Activate your first guest</h2>
              <p className="muted" style={{ marginTop: 0 }}>Publish the tested property, then create or import the first stay. Moche generates the guest access link and visit code from that stay.</p>
              {!live ? <Link href={`/dashboard/properties/${props.property.id}/brain/go-live`} className="btn btn-primary">Review and go live <ArrowRight size={15} aria-hidden /></Link> : <Link href={`/dashboard/properties/${props.property.id}/stays`} className="btn btn-primary">{props.stayCount === 0 ? 'Create or import the first stay' : 'Open guest access'} <ArrowRight size={15} aria-hidden /></Link>}
            </section>
          )}
        </div>
      )}

      <ol style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.5rem' }} aria-label="Activation progress">
        {steps.map((step, index) => <li key={step.title} className="card-2" style={{ padding: '.75rem', display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.82rem' }}>{step.done ? <Check size={15} aria-hidden style={{ color: 'var(--teal)' }} /> : <Circle size={15} aria-hidden className="muted" />}<span>{index + 1}. {step.title}</span></li>)}
      </ol>
    </main>
  );
}

function StatusLine({ done, label }: { done: boolean; label: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.9rem' }}>{done ? <Check size={16} aria-hidden style={{ color: 'var(--teal)' }} /> : <Circle size={16} aria-hidden className="muted" />}<span>{label}</span></div>;
}
