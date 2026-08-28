'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ConciergeBell, Wrench } from 'lucide-react';
import type { PortalT } from '@/lib/guest/portal-strings';

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
// The interview chat shares the portal's bubble animation + pill composer, so
// it feels like the same conversation surface as Ask and Host Chat.
//
// Host preview: the same interview engine runs server-side against a transcript
// the browser holds — no service_requests row, no host notification. Completion
// shows a clearly-marked PRV- reference instead of a real one.
export function MaintenanceWorkflow(props: {
  slug: string;
  propertyId?: string;
  hostPreview?: boolean;
  t: PortalT;
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const { t } = props;
  const hostPreview = props.hostPreview === true;
  const [phase, setPhase] = useState<Phase>('idle');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [serverRef, setServerRef] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [resumable, setResumable] = useState<SrListRow | null>(null);
  const [checked, setChecked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // On entry, look for an in-progress report so a guest who left mid-interview
  // resumes it instead of creating a duplicate. Host preview never resumes —
  // there is no server-side report to resume.
  useEffect(() => {
    if (hostPreview) {
      setChecked(true);
      return;
    }
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
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const handleTurn = useCallback((json: {
    id?: string;
    status: string;
    question?: string;
    choices?: string[] | null;
    guestMessage?: string;
    reference?: string;
    report?: { summary?: string };
  }) => {
    if (json.id) setTicketId(json.id);
    if (typeof json.reference === 'string') setServerRef(json.reference);
    if (json.status === 'safety_escalated') {
      setTurns((current) => [...current, { role: 'assistant', text: json.guestMessage ?? t('mSafetySub') }]);
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
    if (json.question) setTurns((current) => [...current, { role: 'assistant', text: json.question! }]);
    setChoices(Array.isArray(json.choices) ? json.choices : []);
    setPhase('in_progress');
  }, [t]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setInput('');
    setChoices([]);
    setTurns((current) => [...current, { role: 'guest', text: trimmed }]);
    try {
      const url = hostPreview
        ? `/api/host/properties/${props.propertyId}/preview-service-request`
        : ticketId
          ? `/api/guest/${props.slug}/service-request/${ticketId}/message`
          : `/api/guest/${props.slug}/service-request/start`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          hostPreview
            ? {
                message: trimmed,
                // The sandbox holds no ticket row; resend the prior turns so the
                // real interview engine sees the same context it would in production.
                transcript: turns.map((turn) => ({ role: turn.role, text: turn.text })),
              }
            : { message: trimmed },
        ),
      });
      if (res.status === 401 && !hostPreview) { props.onSessionExpired(); return; }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'sr_failed');
      handleTurn(json);
    } catch {
      setTurns((current) => [...current, { role: 'assistant', text: t('mError') }]);
    } finally {
      setBusy(false);
    }
  }, [busy, ticketId, turns, hostPreview, props, handleTurn, t]);

  function resume() {
    if (!resumable) return;
    setTicketId(resumable.id);
    const transcript = Array.isArray(resumable.interview_transcript) ? resumable.interview_transcript : [];
    const restored: Turn[] = transcript.map((row): Turn => {
      const turn = row as { role?: string; text?: string; content?: string };
      return { role: turn.role === 'guest' ? 'guest' : 'assistant', text: String(turn.text ?? turn.content ?? '') };
    }).filter((turn) => turn.text.length > 0);
    setTurns(restored.length > 0 ? restored : [{ role: 'guest', text: resumable.description }]);
    setPhase('in_progress');
  }

  function reset() {
    setPhase('idle');
    setTicketId(null);
    setServerRef(null);
    setTurns([]);
    setChoices([]);
    setSummary(null);
    setResumable(null);
  }

  const reference = hostPreview
    ? (serverRef ?? 'PRV-PREVIEW')
    : ticketId ? `SR-${ticketId.replace(/-/g, '').slice(0, 8).toUpperCase()}` : null;

  return (
    <section aria-label={t('mTitle')} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="gp-wf-header">
        <button type="button" className="gp-back" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> {t('menu')}
        </button>
        <span className="gp-wf-title">{t('mTitle')}</span>
      </div>

      {phase === 'idle' && (
        <>
          <p className="gp-step-sub">{t('mSub')}</p>

          {checked && resumable ? (
            <div className="gp-card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('mResumeTitle')}</div>
              <div className="gp-muted" style={{ fontSize: '0.85rem', marginBottom: 10 }}>{resumable.description}</div>
              <button type="button" className="gp-btn gp-btn-ghost" onClick={resume}>{t('mResumeCta')}</button>
            </div>
          ) : null}

          <form onSubmit={(event) => { event.preventDefault(); void send(input); }}>
            <textarea
              className="gp-textarea"
              placeholder={t('mPlaceholder')}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
              maxLength={2000}
              aria-label={t('mTitle')}
            />
            <div style={{ height: 12 }} />
            <button type="submit" className="gp-btn gp-btn-primary" disabled={busy || !input.trim()}>
              {busy ? t('mStarting') : t('mStart')}
            </button>
          </form>
        </>
      )}

      {phase === 'in_progress' && (
        <>
          <div className="gp-chat-list" ref={listRef} aria-live="polite">
            {turns.map((turn, index) => (
              <div key={index} className={`gp-bubble ${turn.role === 'guest' ? 'gp-bubble-user' : 'gp-bubble-assistant'}`}>
                {turn.role === 'assistant' ? <span className="gp-bubble-tag">{t('mTroubleshooting')}</span> : null}
                {turn.text}
              </div>
            ))}
            {busy ? (
              <div className="gp-bubble gp-bubble-assistant">
                <span className="gp-typing" role="status" aria-label={t('loading')}><span /><span /><span /></span>
              </div>
            ) : null}
          </div>

          {choices.length > 0 ? (
            <div className="gp-chips">
              {choices.map((choice) => (
                <button key={choice} type="button" className="gp-chip" onClick={() => void send(choice)} disabled={busy}>{choice}</button>
              ))}
            </div>
          ) : null}

          <form className="gp-composer" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
            <input
              className="gp-input"
              style={{ background: 'transparent', border: 'none', padding: '10px 0' }}
              type="text"
              placeholder={t('mAnswerPlaceholder')}
              value={input}
              ref={inputRef}
              onChange={(event) => setInput(event.target.value)}
              disabled={busy}
              maxLength={2000}
              aria-label={t('mAnswerPlaceholder')}
            />
            <button type="submit" className="gp-send" disabled={busy || !input.trim()} aria-label={t('sendMessage')} title={t('sendMessage')}>
              <ConciergeBell size={18} aria-hidden />
            </button>
          </form>
        </>
      )}

      {(phase === 'completed' || phase === 'safety_escalated') && (
        <div className="gp-card gp-confirm">
          <CheckCircle2 size={40} className="gp-confirm-icon" aria-hidden />
          <h2 className="gp-step-title" style={{ marginTop: 0 }}>
            {phase === 'safety_escalated' ? t('mHostAlerted') : t('mSubmitted')}
          </h2>
          {reference ? (
            <>
              <div className="gp-muted" style={{ fontSize: '0.85rem' }}>{t('mRefNumber')}</div>
              <div className="gp-ref">{reference}</div>
            </>
          ) : null}
          {summary ? <p className="gp-step-sub" style={{ marginBottom: 8 }}>{summary}</p> : null}
          <p className="gp-step-sub" style={{ marginBottom: 18 }}>
            {phase === 'safety_escalated' ? t('mSafetySub') : t('mDoneSub')}
          </p>
          <button type="button" className="gp-btn gp-btn-primary" onClick={props.onBack}>{t('backToMenu')}</button>
          <div style={{ height: 10 }} />
          <button type="button" className="gp-btn gp-btn-ghost" onClick={reset}>
            <Wrench size={15} aria-hidden /> {t('mReportAnother')}
          </button>
        </div>
      )}
    </section>
  );
}
