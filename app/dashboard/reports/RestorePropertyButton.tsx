'use client';

import { useFormState } from 'react-dom';
import { RotateCcw } from 'lucide-react';
import { restorePropertyAction, type PropertyFormState } from '@/app/dashboard/properties/actions';
import { SubmitButton } from '@/components/FormFeedback';

/**
 * Brings one archived property back into the active Properties list.
 *
 * A client component only because the Reports page is a server component and
 * `useFormState` is needed to show a failure inline. On success the server action
 * revalidates both lists and the row simply disappears from Reports, so there is
 * no success message to render — the property moving is the feedback.
 */
export function RestorePropertyButton({ propertyId }: { propertyId: string }) {
  const [state, restore] = useFormState<PropertyFormState, FormData>(restorePropertyAction, {});

  return (
    <form action={restore} style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <SubmitButton className="btn btn-ghost btn-sm" testId="archived-property-restore">
        <RotateCcw size={13} aria-hidden /> Restore
      </SubmitButton>
      {state.error ? (
        <span className="badge badge-coral" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
