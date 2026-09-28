'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { publishPropertyAction, pausePropertyAction, archivePropertyAction, type PropertyFormState } from '../actions';
import { SubmitButton } from '@/components/FormFeedback';

export function PropertyStatusControls({
  propertyId,
  status,
  canGoLive,
  brainRequired = false,
  completenessRequired = false,
  checklistComplete,
  checklistDetail,
}: {
  propertyId: string;
  status: string;
  canGoLive: boolean;
  brainRequired?: boolean;
  completenessRequired?: boolean;
  checklistComplete: boolean;
  checklistDetail: string;
}) {
  // These are only hints. The server action rechecks the configured gates and
  // any plan requirement at submit time, including changes in another tab.
  const legacyNeedsWork = brainRequired && !canGoLive;
  const checklistNeedsWork = !checklistComplete;
  const goLiveLabel = legacyNeedsWork || (completenessRequired && checklistNeedsWork)
    ? 'Go live (review requirements)'
    : 'Go live';
  const [pubState, publish] = useFormState<PropertyFormState, FormData>(publishPropertyAction, {});
  const [, pause] = useFormState<PropertyFormState, FormData>(pausePropertyAction, {});
  const [, archive] = useFormState<PropertyFormState, FormData>(archivePropertyAction, {});

  return (
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {status !== 'live' && (
        <form action={publish}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <SubmitButton className="btn btn-primary btn-sm">
            {goLiveLabel}
          </SubmitButton>
        </form>
      )}
      {status === 'live' && (
        <form action={pause}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <SubmitButton className="btn btn-coral btn-sm">Pause portal</SubmitButton>
        </form>
      )}
      {status !== 'archived' && (
        <form action={archive}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <SubmitButton className="btn btn-ghost btn-sm">Archive</SubmitButton>
        </form>
      )}
      {status !== 'live' && legacyNeedsWork && (
        <Link className="faint" href={`/dashboard/properties/${propertyId}/brain`} style={{ fontSize: '.8rem' }}>
          Core Brain information required →
        </Link>
      )}
      {status !== 'live' && checklistNeedsWork && (
        <Link className="faint" href={`/dashboard/properties/${propertyId}/brain/go-live`} style={{ fontSize: '.8rem' }}>
          {completenessRequired ? 'Required Brain checklist: ' : 'Brain checklist: '}{checklistDetail} →
        </Link>
      )}
      {pubState.error && <span className="badge badge-coral">{pubState.error}</span>}
    </div>
  );
}
