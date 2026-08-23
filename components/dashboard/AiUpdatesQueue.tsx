'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, X, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import {
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_SOURCE_LABEL,
  proposableField,
  summarizeValue,
  type ProposedUpdateStatus,
  type ProposalSourceType,
} from '@/lib/brain/proposals';
import type { AiUpdatesView } from '@/lib/brain/ai-updates';

export type ProposalRow = {
  id: string;
  property_id: string;
  field_path: string;
  label: string;
  status: ProposedUpdateStatus;
  proposed_value: unknown;
  original_value: unknown;
  applied_value: unknown;
  source_type: string;
  source_ref: string | null;
  confidence: number | null;
  resolution_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function fmt(value: string | null) {
  if (!value) return '\u2014';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Pull editable text out of a proposal value, whichever shape it has. */
function editableText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const t = (value as { text?: unknown }).text;
    if (typeof t === 'string') return t;
  }
  return '';
}

/** Put edited text back into the shape the field expects. */
function withText(original: unknown, text: string): unknown {
  if (original && typeof original === 'object' && !Array.isArray(original)) {
    return { ...(original as Record<string, unknown>), text };
  }
  return text;
}

export function AiUpdatesQueue({
  rows,
  view,
  propertyNames,
  manageableProperties,
  showPropertyName = true,
  emptyPendingCopy,
}: {
  rows: ProposalRow[];
  view: AiUpdatesView;
  propertyNames: Record<string, string>;
  /** Property ids this user may act on. Rows outside it render read-only. */
  manageableProperties: string[];
  /**
   * The per-property tab already names the property in its breadcrumb and page
   * header, so repeating it on every row is noise. The account-wide roll-up has
   * no such context and needs it.
   */
  showPropertyName?: boolean;
  /** Overrides the pending empty state so each surface can say what to do next. */
  emptyPendingCopy?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const manageable = new Set(manageableProperties);

  async function decide(row: ProposalRow, decision: 'approve' | 'modify' | 'deny', value?: unknown) {
    setBusy(`${row.id}:${decision}`);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${row.property_id}/updates/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, ...(value === undefined ? {} : { value }) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Could not save that decision.');
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <Sparkles size={22} aria-hidden style={{ color: 'var(--text-faint)', marginBottom: '.6rem' }} />
        <p className="muted" style={{ margin: 0 }}>
          {view === 'pending'
            ? (emptyPendingCopy ??
              'Nothing waiting. Import a listing URL or a document and the draft will land here for you to check.')
            : 'Nothing reviewed yet.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <p role="alert" style={{ color: 'var(--coral)', fontSize: '.88rem', margin: '0 0 .75rem' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'grid', gap: '.7rem' }}>
        {rows.map((row) => {
          const canAct = view === 'pending' && manageable.has(row.property_id);
          const open = openId === row.id;
          const isEditing = editing === row.id;
          const field = proposableField(row.field_path);
          const shown = row.status === 'pending' ? row.proposed_value : (row.applied_value ?? row.proposed_value);
          const sourceLabel =
            PROPOSAL_SOURCE_LABEL[row.source_type as ProposalSourceType] ?? 'Suggested by the assistant';

          return (
            <div key={row.id} className="card" style={{ padding: '1rem' }} data-testid="proposal-row">
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 20rem' }}>
                  <p style={{ margin: '0 0 .2rem', fontWeight: 600, fontSize: '.95rem' }}>{row.label}</p>
                  <p className="report-list-meta" style={{ margin: 0 }}>
                    {showPropertyName && <>{propertyNames[row.property_id] ?? 'Property'} &middot; </>}
                    {field?.label ?? row.field_path} &middot; {sourceLabel} &middot; {fmt(row.created_at)}
                  </p>
                  {row.status !== 'pending' && (
                    <p className="report-list-meta" style={{ margin: '.15rem 0 0' }}>
                      <span className={`badge ${row.status === 'denied' ? 'badge-coral' : 'badge-teal'}`}>
                        {PROPOSAL_STATUS_LABEL[row.status]}
                      </span>{' '}
                      {row.reviewed_at && <span className="faint">on {fmt(row.reviewed_at)}</span>}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setOpenId(open ? null : row.id)}
                  aria-expanded={open}
                >
                  {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
                  {open ? 'Hide' : 'Read it'}
                </button>
              </div>

              {!open && (
                <p className="muted" style={{ margin: '.5rem 0 0', fontSize: '.85rem' }}>
                  {summarizeValue(shown, 200)}
                </p>
              )}

              {open && (
                <div style={{ marginTop: '.7rem' }}>
                  {row.original_value != null && (
                    <div style={{ marginBottom: '.6rem' }}>
                      <p className="faint" style={{ margin: '0 0 .2rem', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        What you have now
                      </p>
                      <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>{summarizeValue(row.original_value, 600)}</p>
                    </div>
                  )}

                  <p className="faint" style={{ margin: '0 0 .2rem', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {row.status === 'pending' ? 'Suggested' : 'What was saved'}
                  </p>

                  {isEditing ? (
                    <div className="field" style={{ marginTop: '.3rem' }}>
                      <label className="label" htmlFor={`edit-${row.id}`}>
                        Correct it before approving
                      </label>
                      <textarea
                        id={`edit-${row.id}`}
                        className="textarea"
                        rows={12}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                  ) : (
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        font: 'inherit',
                        fontSize: '.85rem',
                        color: 'var(--text-muted)',
                        maxHeight: '22rem',
                        overflow: 'auto',
                      }}
                    >
                      {editableText(shown) || summarizeValue(shown, 2000)}
                    </pre>
                  )}

                  {row.source_ref && (
                    <p className="faint" style={{ margin: '.5rem 0 0', fontSize: '.75rem', wordBreak: 'break-all' }}>
                      Source: {row.source_ref}
                    </p>
                  )}
                  {row.resolution_note && (
                    <p className="faint" style={{ margin: '.35rem 0 0', fontSize: '.75rem' }}>
                      Note: {row.resolution_note}
                    </p>
                  )}
                </div>
              )}

              {canAct && (
                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.8rem' }}>
                  {isEditing ? (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null || draft.trim().length < 20}
                        onClick={() => decide(row, 'modify', withText(row.proposed_value, draft))}
                      >
                        <Check size={14} aria-hidden /> Save my version
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null}
                        onClick={() => decide(row, 'approve')}
                      >
                        <Check size={14} aria-hidden />
                        {busy === `${row.id}:approve` ? 'Approving\u2026' : 'Approve'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy !== null}
                        onClick={() => {
                          setOpenId(row.id);
                          setEditing(row.id);
                          setDraft(editableText(row.proposed_value));
                        }}
                      >
                        <Pencil size={14} aria-hidden /> Edit first
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy !== null}
                        onClick={() => decide(row, 'deny')}
                      >
                        <X size={14} aria-hidden />
                        {busy === `${row.id}:deny` ? 'Declining\u2026' : 'Decline'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
