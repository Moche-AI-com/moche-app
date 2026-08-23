'use client';

// The multi-step manual onboarding wizard (directive §2).
//
// WHY EACH STEP POSTS ON ITS OWN
// Every step is a separate form submitted to a separate server action, and the
// property row exists from step 1 onward. A host who closes the tab on step 7 keeps
// steps 1-6. The alternative — accumulate everything client-side and write once at
// the end — is shorter code and loses real work.
//
// WHY THE STEP LIST IS DERIVED, NOT HARD-CODED
// `visibleSteps(applicable)` is the same function the server uses to decide which
// answers it will accept. The client cannot show a question the server would refuse,
// and it cannot skip one the server expects, because both read one definition.
//
// WHY THERE IS NO "SKIP ALL" SHORTCUT
// Every question step already accepts an empty submit, so skipping is one click on
// "Continue". A separate skip-everything affordance would optimise for the outcome
// we are trying to avoid.

import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-dom';
import Link from 'next/link';
import { Check, ChevronLeft, Sparkles } from 'lucide-react';
import { SubmitButton, FormMessage } from '@/components/FormFeedback';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import {
  visibleSteps,
  wizardCoverage,
  predicateLabel,
  WIZARD_PREDICATES,
  WIZARD_COVERAGE_TARGET,
  type WizardStep,
} from '@/lib/onboarding/wizard';
import { QuestionField, Stepper, Hint } from './WizardControls';
import {
  createWizardPropertyAction,
  saveWizardFeaturesAction,
  saveWizardStepAction,
  finishWizardAction,
  type WizardCreateState,
  type WizardFeaturesState,
  type WizardStepState,
  type WizardFinishState,
} from './wizard-actions';

const COMMON_TZ = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Asia/Tokyo', 'Australia/Sydney',
];

export function PropertyWizard({ defaultTimezone }: { defaultTimezone: string }) {
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [floors, setFloors] = useState<string>('');
  const [applicable, setApplicable] = useState<string[] | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState<WizardFinishState | null>(null);

  // Until the features step is submitted, the ungated steps are the honest preview
  // of what is coming. Passing [] rather than every predicate keeps the progress
  // count from promising steps the host may never see.
  const steps = useMemo(() => visibleSteps(applicable ?? []), [applicable]);
  const step = steps[Math.min(index, steps.length - 1)];

  const coverage = useMemo(
    () => wizardCoverage({ applicable: applicable ?? [], answered }),
    [applicable, answered],
  );

  const advance = () => setIndex((i) => Math.min(i + 1, steps.length - 1));

  if (finished?.done) {
    return <Finished state={finished} propertyId={propertyId} />;
  }

  return (
    <div className="wizard">
      <Progress steps={steps} index={index} coverage={coverage} />

      <div className="card wizard-card">
        <header className="wizard-head">
          <h2>{step.title}</h2>
          <p className="faint">{step.blurb}</p>
        </header>

        {step.kind === 'core' ? (
          <CoreStep
            defaultTimezone={defaultTimezone}
            floors={floors}
            onFloors={setFloors}
            onCreated={(id) => {
              setPropertyId(id);
              advance();
            }}
          />
        ) : null}

        {step.kind === 'features' && propertyId ? (
          <FeaturesStep
            propertyId={propertyId}
            floors={floors}
            onSaved={(list) => {
              setApplicable(list);
              advance();
            }}
          />
        ) : null}

        {step.kind === 'questions' && propertyId ? (
          <QuestionStep
            key={step.id}
            propertyId={propertyId}
            step={step}
            onSaved={(saved) => {
              setAnswered((prev) => [...new Set([...prev, ...saved])]);
              advance();
            }}
            onBack={index > 0 ? () => setIndex((i) => i - 1) : undefined}
          />
        ) : null}

        {step.kind === 'documents' && propertyId ? (
          <DocumentsStep
            propertyId={propertyId}
            onDone={setFinished}
            onBack={() => setIndex((i) => i - 1)}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- progress */

/**
 * Progress, plus the live Brain coverage the answers so far have earned.
 *
 * The coverage number is the same weighted figure the Brain page shows, computed by
 * the same function — a wizard-only percentage that disagreed with the Coverage Map
 * would be worse than showing nothing.
 */
function Progress({ steps, index, coverage }: { steps: WizardStep[]; index: number; coverage: number }) {
  const pct = Math.round(((index + 1) / steps.length) * 100);
  const hitTarget = coverage >= WIZARD_COVERAGE_TARGET;
  return (
    <div className="wizard-progress">
      <div className="wizard-progress-row">
        <span className="faint">
          Step {index + 1} of {steps.length}
        </span>
        <span className={hitTarget ? 'wizard-cov wizard-cov-good' : 'wizard-cov'}>
          {hitTarget ? <Check size={13} aria-hidden="true" /> : null}
          Brain coverage {coverage}%
        </span>
      </div>
      <div className="wizard-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol className="wizard-dots">
        {steps.map((s, i) => (
          <li key={s.id} className={i < index ? 'done' : i === index ? 'here' : ''} aria-current={i === index ? 'step' : undefined}>
            <span className="wizard-dot-label">{s.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------- step: core */

function CoreStep({
  defaultTimezone,
  floors,
  onFloors,
  onCreated,
}: {
  defaultTimezone: string;
  floors: string;
  onFloors: (v: string) => void;
  onCreated: (id: string) => void;
}) {
  const [state, formAction] = useFormState<WizardCreateState, FormData>(createWizardPropertyAction, {});

  // Advancing in an effect, not in the render path: calling setState during a render
  // that happens to carry a success payload is the bug that produces an infinite
  // re-render loop in a useFormState success branch.
  useEffect(() => {
    if (state.propertyId) onCreated(state.propertyId);
  }, [state.propertyId, onCreated]);

  return (
    <form action={formAction}>
      <FormMessage error={state.error} />

      <div className="field">
        <label className="label" htmlFor="displayName">
          Property name
        </label>
        <input className="input" id="displayName" name="displayName" maxLength={120} required placeholder="Beachside Cottage" />
      </div>

      <AddressAutocomplete targets={{ city: 'city', state: 'region', country: 'country' }} />

      <div className="wizard-grid-3">
        <div className="field">
          <label className="label" htmlFor="city">
            City
          </label>
          <input className="input" id="city" name="city" maxLength={120} required placeholder="Barcelona" />
        </div>
        <div className="field">
          <label className="label" htmlFor="region">
            Region / state
          </label>
          <input className="input" id="region" name="region" maxLength={120} placeholder="Catalonia" />
        </div>
        <div className="field">
          <label className="label" htmlFor="country">
            Country
          </label>
          <input className="input" id="country" name="country" maxLength={120} required placeholder="Spain" />
        </div>
      </div>

      <fieldset className="wizard-fieldset">
        <legend className="label">Size and layout</legend>
        <div className="wizard-grid-4">
          <div className="field">
            <label className="label" htmlFor="bedrooms">
              Bedrooms
            </label>
            <Stepper name="bedrooms" id="bedrooms" min={0} max={30} />
          </div>
          <div className="field">
            <label className="label" htmlFor="bathrooms">
              Bathrooms
            </label>
            <Stepper name="bathrooms" id="bathrooms" min={0} max={30} />
          </div>
          <div className="field">
            <label className="label" htmlFor="floors">
              Floors
            </label>
            <div onChange={(e) => onFloors((e.target as HTMLInputElement).value)}>
              <Stepper name="floors" id="floors" min={1} max={20} defaultValue={floors} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="squareFeet">
              Size
            </label>
            <Stepper name="squareFeet" id="squareFeet" min={30} max={100000} unit="sq ft" />
          </div>
        </div>
        <Hint text="Guests ask how many beds and baths constantly, and the floor count tells us whether to ask you about stairs or a lift later on." />
      </fieldset>

      <div className="wizard-grid-2">
        <div className="field">
          <label className="label" htmlFor="timezone">
            Timezone
          </label>
          <select className="select" id="timezone" name="timezone" defaultValue={defaultTimezone}>
            {[...new Set([defaultTimezone, ...COMMON_TZ])].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="locale">
            Default language
          </label>
          <select className="select" id="locale" name="locale" defaultValue="en">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="pt">Português</option>
            <option value="it">Italiano</option>
          </select>
        </div>
      </div>

      <div className="wizard-actions">
        <SubmitButton className="btn btn-primary">Create and continue</SubmitButton>
      </div>
      <p className="faint wizard-note">
        The property is saved from here on, so you can stop at any step and pick it up later.
      </p>
    </form>
  );
}

/* ---------------------------------------------------------- step: features */

function FeaturesStep({
  propertyId,
  floors,
  onSaved,
}: {
  propertyId: string;
  floors: string;
  onSaved: (applicable: string[]) => void;
}) {
  const [state, formAction] = useFormState<WizardFeaturesState, FormData>(saveWizardFeaturesAction, {});

  useEffect(() => {
    if (state.applicable) onSaved(state.applicable);
  }, [state.applicable, onSaved]);

  // is_multi_story is answered by the floor count on step 1. Asking again would be
  // asking the host to tell us something they just told us.
  const asked = WIZARD_PREDICATES.filter((p) => p !== 'is_multi_story');

  return (
    <form action={formAction}>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="floors" value={floors} />

      <div className="wizard-checks">
        {asked.map((p) => (
          <label key={p} className="wizard-check">
            <input type="checkbox" name="predicate" value={p} />
            <span>{predicateLabel(p)}</span>
          </label>
        ))}
      </div>

      <Hint text="Anything you leave unticked is treated as absent, not as unanswered — it stays out of your Brain score instead of sitting there as a permanent gap." />

      <div className="wizard-actions">
        <SubmitButton className="btn btn-primary">Continue</SubmitButton>
      </div>
    </form>
  );
}

/* --------------------------------------------------------- step: questions */

function QuestionStep({
  propertyId,
  step,
  onSaved,
  onBack,
}: {
  propertyId: string;
  step: WizardStep;
  onSaved: (savedFieldIds: string[]) => void;
  onBack?: () => void;
}) {
  const [state, formAction] = useFormState<WizardStepState, FormData>(saveWizardStepAction, {});

  useEffect(() => {
    if (state.ok) onSaved(step.questions.map((q) => q.fieldId));
    // `step` is stable for the life of this component: the parent keys it by step.id.
  }, [state.ok, onSaved, step.questions]);

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <FormMessage error={state.error} />
      {Object.keys(fieldErrors).length > 0 ? (
        <div className="alert alert-warn" role="alert">
          We saved the rest of this step. Two or three answers need a small fix below.
        </div>
      ) : null}
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="stepId" value={step.id} />

      {step.questions.map((q) => (
        <QuestionField key={q.fieldId} q={q} error={fieldErrors[q.fieldId]} />
      ))}

      <div className="wizard-actions">
        {onBack ? (
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            <ChevronLeft size={15} aria-hidden="true" /> Back
          </button>
        ) : null}
        <SubmitButton className="btn btn-primary">Continue</SubmitButton>
      </div>
      <p className="faint wizard-note">
        Leave anything blank you do not know yet. It stays on your Brain page as an open question.
      </p>
    </form>
  );
}

/* --------------------------------------------------------- step: documents */

function DocumentsStep({
  propertyId,
  onDone,
  onBack,
}: {
  propertyId: string;
  onDone: (state: WizardFinishState) => void;
  onBack: () => void;
}) {
  const [state, formAction] = useFormState<WizardFinishState, FormData>(finishWizardAction, {});

  useEffect(() => {
    if (state.done) onDone(state);
  }, [state, onDone]);

  return (
    <form action={formAction}>
      <FormMessage error={state.error} />
      <input type="hidden" name="propertyId" value={propertyId} />

      <div className="field">
        <label className="label" htmlFor="pastedText">
          Paste your house manual, welcome message, or check-in email
        </label>
        <textarea
          className="input"
          id="pastedText"
          name="pastedText"
          rows={10}
          maxLength={40000}
          placeholder={'Paste anything you already send guests. We split it into separate topics and file each one in the right section.'}
        />
      </div>

      <Hint text="Nothing here is published straight to your Brain. A stronger model reads it, splits it by topic, and files each part as a suggestion for you to approve on the AI Updates tab. If something contradicts an answer you gave earlier in this wizard, we flag it rather than overwrite it." />

      <div className="wizard-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ChevronLeft size={15} aria-hidden="true" /> Back
        </button>
        <SubmitButton className="btn btn-primary">
          <Sparkles size={15} aria-hidden="true" /> Read it and finish
        </SubmitButton>
      </div>
      <p className="faint wizard-note">Nothing to paste? Finish without it — you can import documents any time.</p>
    </form>
  );
}

/* -------------------------------------------------------------- completion */

function Finished({ state, propertyId }: { state: WizardFinishState; propertyId: string | null }) {
  return (
    <div className="card wizard-card">
      <h2>Your property is set up</h2>
      {state.notice ? (
        <div className={state.conflictCount ? 'alert alert-warn' : 'alert alert-info'} role="status">
          {state.notice}
        </div>
      ) : null}
      <p className="faint">
        Everything you answered is already in the Brain. Open the Brain page to see what is still open, or jump
        straight to the property.
      </p>
      <div className="wizard-actions">
        {propertyId ? (
          <>
            <Link className="btn btn-primary" href={`/dashboard/properties/${propertyId}/brain`}>
              Open the Property Brain
            </Link>
            {state.proposalCount ? (
              <Link className="btn btn-ghost" href={`/dashboard/properties/${propertyId}/updates`}>
                Review {state.proposalCount} suggestion{state.proposalCount === 1 ? '' : 's'}
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
