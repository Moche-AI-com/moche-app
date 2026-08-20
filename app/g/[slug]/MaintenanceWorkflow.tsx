'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Send, Wrench } from 'lucide-react';

type Turn = { role: 'guest' | 'assistant'; text: string };
type Phase = 'idle' | 'in_progress' | 'completed' | 'safety_escalated';

type SrListRow = {
  id: string;
  status: string;
  interview_status: string;
  description: string;
  summary: string | null;
  interview_transcript: unknown;
  created_at: string;
};

// Workflow 3 — Report Service Maintenance. The AI offers safe troubleshooting,
// asks the context questions needed for a service report, then files it with a
// reference number. Duplicates are prevented three ways: resume of any
// in-progress report, a busy latch on submit, and server-side de-dupe.
export function MaintenanceWorkflow(props: {
  slug: string;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [resumable, setResumable] = useState<SrListRow | null>(null);
  const [checked, setChecked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // On entry, look for an in-progress report so a guest who left mid-interview
  // resumes it instead of creating a duplicate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/guest/${props.slug}/service-requests`);
        if (res.status === 401) { props.onSessionExpired(); return; }
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        const list: SrListRow[] = Array.isArray(json) ? json : (json.requests ?? json.serviceRequests ?? []);
        if (cancelled) return;
        const open = list.find((r) => r.interview_status === 'in_progress') ?? null;
        setResumable(open);
        setChecked(true);
      } catch {
        setChecked(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  const handleTurn = useCallback((json: {
    id?: string;
    status: string;
    question?: string;
    choices?: string[] | null;
    guestMessage?: string;
    report?: { summary?: string };
  }) => {
    if (json.id) setTicketId(json.id);
    if (json.status === 'safety_escalated') {
      setTurns((t) => [...t, { role: 'assistant', text: json.guestMessage ?? 'We have flagged this for your host right away.' }]);
      setSummary(null);
      setPhase('safety_escalated');
      setChoices([]);
      return;
    }
    if (json.status === 'completed') {
      setSummary(json.report?.summary ?? null);
      setPhase('completed');
      setChoices([]);
      return;
    }
    if (json.question) setTurns((t) => [...t, { role: 'assistant', text: json.question! }]);
    setChoices(Array.isArray(json.choices) ? json.choices : []);
    setPhase('in_progress');
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput('');
    setChoices([]);
    setTurns((t) => [...t, { role: 'guest', text: trimmed }]);
    try {
      const url = ticketId
        ? `/api/guest/${props.slug}/service-request/${ticketId}/message`
        : `/api/guest/${props.slug}/service-request/start`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.status === 401) { props.onSessionExpired(); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'sr_failed');
      handleTurn(json);
    } catch {
      setTurns((t) => [...t, { role: 'assistant', text: 'Sorry — something went wrong. Please try again.' }]);
    } finally {
      setBusy(false);
    }
  }, [busy, ticketId, props, handleTurn]);

  function resume() {
    if (!resumable) return;
    setTicketId(resumable.id);
    const transcript = Array.isArray(resumable.interview_transcript) ? resumable.interview_transcript : [];
      const restored: Turn[] = transcript.map((t): Turn => {
      const row = t as { role?: string; text?: string; content?: string };
      return { role: row.role === 'guest' ? 'guest' : 'assistant', text: String(row.text ?? row.content ?? '') };
    }).filter((t) => t.text.length > 0);
    setTurns(restored.length > 0 ? restored : [{ role: 'guest', text: resumable.description }]);
    setPhase('in_progress');
  }

  function reset() {
    setPhase('idle');
    setTicketId(null);
    setTurns([]);
    setChoices([]);
    setSummary(null);
    setResumable(null);
  }

  const reference = ticketId ? `SR-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}` : null;

  return (
    <section aria-label="Report service maintenance" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> Menu
        </button>
        <span className="gp-wf-title">Report Maintenance</span>
      </div>

      {phase === 'idle' && (
        <>
          <p className="gp-step-sub">
            Describe the issue. The AI will first suggest safe things to try, then ask a few quick questions so the team arrives prepared.
          </p>

          {checked && resumable ? (
            <div className="gp-card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>You have a report in progress</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: 10 }}>{resumable.description}</div>
              <button type="button" className="gp-btn gp-btn-ghost" onClick={resume}>Continue that report</button>
            </div>
          ) : null}

          <form onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <textarea
              className="gp-textarea"
              placeholder="e.g. The kitchen sink is leaking under the cabinet…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              maxLength={2000}
              aria-label="Describe the issue"
            />
            <div style={{ height: 12 }} />
            <button type="submit" className="gp-btn gp-btn-primary" disabled={busy || !input.trim()}>
              {busy ? 'Starting…' : 'Start report'}
            </button>
          </form>
        </>
      )}

      {phase === 'in_progress' && (
        <>
          <div className="gp-chat-list" ref={listRef} aria-live="polite">
            {turns.map((t, i) => (
              <div key={i} className={`gp-bubble ${t.role === 'guest' ? 'gp-bubble-user' : 'gp-bubble-assistant'}`}>
                {t.role === 'assistant' ? <span className="gp-bubble-tag">Troubleshooting</span> : null}
                {t.text}
              </div>
            ))}
            {busy ? <div className="gp-bubble gp-bubble-assistant"><Loader2 size={16} className="gp-spin" aria-label="Thinking" /></div> : null}
          </div>

          {choices.length > 0 ? (
            <div className="gp-chips">
              {choices.map((c) => (
                <button key={c} type="button" className="gp-chip" onClick={() => void send(c)} disabled={busy}>{c}</button>
              ))}
            </div>
          ) : null}

          <form className="gp-input-row" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input
              className="gp-input"
              type="text"
              placeholder="Type your answer…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              maxLength={2000}
              aria-label="Answer"
            />
            <button type="submit" className="gp-send" disabled={busy || !input.trim()} aria-label="Send">
              <Send size={18} aria-hidden />
            </button>
          </form>
        </>
      )}

      {(phase === 'completed' || phase === 'safety_escalated') && (
        <div className="gp-card gp-confirm">
          <CheckCircle2 size={40} className="gp-confirm-icon" aria-hidden />
          <h2 className="gp-step-title" style={{ marginTop: 0 }}>
            {phase === 'safety_escalated' ? 'Your host has been alerted' : 'Report submitted'}
          </h2>
          {reference ? (
            <>
              <div style={{ fontSize: '0.85rem', opacity: 0.65 }}>Reference number</div>
              <div className="gp-ref">{reference}</div>
            </>
          ) : null}
          {summary ? <p className="gp-step-sub" style={{ marginBottom: 8 }}>{summary}</p> : null}
          <p className="gp-step-sub" style={{ marginBottom: 18 }}>
            {phase === 'safety_escalated'
              ? 'This was treated as urgent and sent to your host right away.'
              : 'Your host and the maintenance team have been notified. Quote the reference number if you follow up.'}
          </p>
          <button type="button" className="gp-btn gp-btn-primary" onClick={props.onBack}>Back to menu</button>
          <div style={{ height: 10 }} />
          <button type="button" className="gp-btn gp-btn-ghost" onClick={reset}>
            <Wrench size={15} aria-hidden /> Report another issue
          </button>
        </div>
      )}
    </section>
  );
}
