'use client';

// Shows the host where imported content came from and gives them one action that
// removes it. Rendered only when at least one import exists, so a hand-built
// property never carries an empty legal-looking card (Directive Section 0.4, D-0013).

import { useActionState } from 'react';
import { purgeImportProvenanceAction, type PurgeImportState } from './import-provenance-actions';

export interface ImportProvenanceItem {
  jobId: string;
  sourceUrl: string;
  provider: string;
  /** ISO string; formatted on the client so it renders in the host's own timezone. */
  fetchedAt: string;
  status: string;
  attestedAt: string | null;
  attestationText: string | null;
  artifactCount: number;
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'unknown date'
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

export function ImportProvenancePanel({
  propertyId,
  canEdit,
  imports,
}: {
  propertyId: string;
  canEdit: boolean;
  imports: ImportProvenanceItem[];
}) {
  const [state, action, pending] = useActionState<PurgeImportState, FormData>(
    purgeImportProvenanceAction,
    {},
  );
  if (imports.length === 0) return null;

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '.35rem' }}>Imported from a listing</h3>
      <p className="faint" style={{ fontSize: '.75rem', marginBottom: '.75rem' }}>
        Where this property&apos;s imported details came from.
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {imports.map((item) => (
          <li
            key={item.jobId}
            style={{ fontSize: '.8rem', padding: '.5rem 0', borderTop: '1px solid var(--border)' }}
          >
            <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener nofollow">
              {hostOf(item.sourceUrl)}
            </a>
            <div className="faint" style={{ fontSize: '.72rem', marginTop: '.15rem' }}>
              Read {formatWhen(item.fetchedAt)} · {item.status} · {item.artifactCount} stored{' '}
              {item.artifactCount === 1 ? 'capture' : 'captures'}
            </div>
            {item.attestedAt ? (
              <div className="faint" style={{ fontSize: '.72rem' }}>
                You confirmed ownership {formatWhen(item.attestedAt)}
              </div>
            ) : (
              // Imports created before attestation was required. Named plainly
              // rather than hidden, since it is the host's own record.
              <div className="faint" style={{ fontSize: '.72rem' }}>
                Imported before ownership confirmation was recorded
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <form action={action} style={{ marginTop: '.85rem' }}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <button type="submit" className="btn btn-sm btn-ghost btn-block" disabled={pending}>
            {pending ? 'Deleting…' : 'Delete imported source material'}
          </button>
          <p className="faint" style={{ fontSize: '.7rem', marginTop: '.35rem' }} aria-live="polite">
            {state.error ??
              state.message ??
              'Removes the saved listing text and source record. Your property and anything you have approved stay.'}
          </p>
        </form>
      )}
    </div>
  );
}
