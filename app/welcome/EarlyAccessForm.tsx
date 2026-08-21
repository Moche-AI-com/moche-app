'use client';

import { useState } from 'react';

const PLANS = [
  { id: 'essentials', label: 'Essentials — $29/property/mo' },
  { id: 'pro', label: 'Pro — $49/property/mo' },
  { id: 'portfolio', label: 'Portfolio — 10+ properties' },
  { id: 'enterprise', label: 'Enterprise — 41+ / custom' },
  { id: 'not_sure', label: 'Not sure yet' },
];

const PROPERTY_COUNTS = ['1', '2-5', '6-10', '10+'];

const FEATURES = [
  'AI guest answers',
  'Guest portal',
  'Service / maintenance requests',
  'Extras & upsells',
  'Local recommendations',
  'Review prompts',
  'Property Brain / knowledge import',
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f1514',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  color: 'inherit',
  padding: '11px 12px',
  fontSize: '.92rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '.8rem',
  fontWeight: 600,
  marginBottom: 5,
  opacity: 0.85,
};

export function EarlyAccessForm({
  defaultEmail,
  defaultName,
  userId,
}: {
  defaultEmail: string | null;
  defaultName: string;
  userId: string | null;
}) {
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const [desiredPlan, setDesiredPlan] = useState('not_sure');
  const [propertyCount, setPropertyCount] = useState('1');
  const [propertyLocations, setPropertyLocations] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFeature(f: string) {
    setFeatures((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          phone: phone || undefined,
          desired_plan: desiredPlan,
          property_count: propertyCount,
          property_locations: propertyLocations || undefined,
          features_wanted: features,
          notes: notes || undefined,
          user_id: userId ?? undefined,
          source: 'welcome',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error('submit_failed');
      setDone(true);
    } catch {
      setError('Something went wrong saving that. Your spot is still held — you can try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        style={{
          background: 'rgba(51,230,212,0.08)',
          border: '1px solid rgba(51,230,212,0.3)',
          borderRadius: 12,
          padding: '1rem 1.1rem',
          fontSize: '.9rem',
          lineHeight: 1.55,
        }}
      >
        Saved — thank you. We will use this to get your workspace ready, and we will email you on
        launch day.
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gap: '.9rem' }}>
        <div>
          <label style={labelStyle} htmlFor="ea-name">Full name</label>
          <input id="ea-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoComplete="name" />
        </div>

        <div>
          <label style={labelStyle} htmlFor="ea-email">Email</label>
          <input id="ea-email" style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
        </div>

        <div>
          <label style={labelStyle} htmlFor="ea-phone">Phone <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
          <input id="ea-phone" style={inputStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.9rem' }}>
          <div>
            <label style={labelStyle} htmlFor="ea-plan">Which plan fits you?</label>
            <select id="ea-plan" style={inputStyle} value={desiredPlan} onChange={(e) => setDesiredPlan(e.target.value)}>
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="ea-count">How many properties?</label>
            <select id="ea-count" style={inputStyle} value={propertyCount} onChange={(e) => setPropertyCount(e.target.value)}>
              {PROPERTY_COUNTS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="ea-loc">Where are your properties?</label>
          <input id="ea-loc" style={inputStyle} value={propertyLocations} onChange={(e) => setPropertyLocations(e.target.value)} placeholder="e.g. Cape Cod, MA · Fort Myers, FL" maxLength={300} />
        </div>

        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ ...labelStyle, marginBottom: 8 }}>What do you want to use first? <span style={{ fontWeight: 400, opacity: 0.6 }}>(pick any)</span></legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FEATURES.map((f) => {
              const on = features.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleFeature(f)}
                  style={{
                    border: `1px solid ${on ? 'var(--teal, #33e6d4)' : 'rgba(255,255,255,0.15)'}`,
                    background: on ? 'rgba(51,230,212,0.12)' : '#0f1514',
                    color: 'inherit',
                    borderRadius: 999,
                    padding: '8px 13px',
                    fontSize: '.82rem',
                    cursor: 'pointer',
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label style={labelStyle} htmlFor="ea-notes">Anything else we should know? <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
          <textarea id="ea-notes" style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </div>

        {error ? (
          <div role="alert" style={{ background: 'rgba(255,107,84,0.12)', border: '1px solid rgba(255,107,84,0.4)', color: '#ffb4a3', borderRadius: 10, padding: '10px 12px', fontSize: '.85rem' }}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{
            border: 'none',
            borderRadius: 10,
            padding: '13px 18px',
            fontSize: '.95rem',
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(115deg,#33e6d4 0%,#58c7e0 45%,#7c8cff 100%)',
            color: '#04121a',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Saving…' : 'Save my preferences'}
        </button>
      </div>
    </form>
  );
}
