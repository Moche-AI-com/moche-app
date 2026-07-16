'use client';

import { useFormState } from 'react-dom';
import { publishPropertyAction, pausePropertyAction, archivePropertyAction, type PropertyFormState } from '../actions';
import { SubmitButton } from '@/components/FormFeedback';

export function PropertyStatusControls({
  propertyId,
  status,
  canGoLive,
}: {
  propertyId: string;
  status: string;
  canGoLive: boolean;
}) {
  const [pubState, publish] = useFormState<PropertyFormState, FormData>(publishPropertyAction, {});
  const [, pause] = useFormState<PropertyFormState, FormData>(pausePropertyAction, {});
  const [, archive] = useFormState<PropertyFormState, FormData>(archivePropertyAction, {});

  return (
    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      {status !== 'live' && (
        <form action={publish}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <SubmitButton className="btn btn-primary btn-sm">
            {canGoLive ? 'Go live' : 'Go live (needs core info)'}
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
      {pubState.error && <span className="badge badge-coral">{pubState.error}</span>}
    </div>
  );
}
