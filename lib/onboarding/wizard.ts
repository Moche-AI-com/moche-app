// The manual Add Property wizard (directive §2).
//
// WHY THIS IS A DATA FILE AND NOT JSX
// The wizard has to satisfy a numeric requirement — "targeting ≥65% Coverage Map
// completion" — and a requirement about conditional questions. Neither is
// checkable if the questions only exist inside a React tree. Declaring the whole
// interview as data makes both testable: `wizardCoverage()` runs the real
// completeness calculation over the real registry, and the step/gating structure
// is asserted directly.
//
// WHY THE REGISTRY IS THE SOURCE OF QUESTION TEXT
// Every question below names a `field_registry.json` field_id and takes its
// host-facing wording from that entry's `interview_prompt`. Writing new copy here
// would create a second place the same question is phrased, which is the exact
// taxonomy drift Phase A exists to end. The only copy this file owns is the copy
// the registry does not have: step titles, control affordances, tooltips, and the
// sub-question labels for composed fields.
//
// WHY SOME QUESTIONS COMPOSE
// §2 asks for follow-ups the registry has no field for — pool depth in feet,
// heated or not, indoor or outdoor, pool rules. Inventing four registry fields
// would mean editing a generated file and silently changing every property's
// denominator. Instead those four answers compose into the one registry field
// that already covers them (`pool_instructions`) as a labelled sentence list.
// Composition is declared, so what the host typed is still recoverable from the
// stored value.

import {
  REGISTRY_FIELDS,
  APPLICABILITY_PREDICATES,
  APPLICABILITY_LABELS,
  computeCompleteness,
  COMPLETENESS_SHIP_THRESHOLD,
  type FieldStatus,
  type RegistryField,
} from '@/lib/brain/completeness';
import { brainSection, sectionLabel } from '@/lib/brain/taxonomy';

// Registry domain ids and Brain section ids are the same identifier by design
// (Phase A: the registry domain IS the host-facing section). brainSection() is
// called anyway rather than trusting that — a domain with no section would
// otherwise render an unlabelled group, and failing at load is cheaper.


/**
 * Input affordance. §2 requires structured input wherever structured input is
 * possible ("avoid free text where structured input possible"), so a control is
 * chosen per question rather than defaulted from the registry type — the registry
 * types `entry_method` as `enum` but carries no option list, and it types
 * `quiet_hours` as `text` when a pair of time pickers is the honest control.
 */
export type WizardControl =
  | 'text'
  | 'textarea'
  | 'time'
  | 'time_range'
  | 'stepper'
  | 'select'
  | 'segmented'
  | 'secret'
  | 'place'
  | 'contact';

export interface WizardOption {
  value: string;
  label: string;
}

/** A follow-up whose answer composes into its parent field rather than its own field. */
export interface WizardSubQuestion {
  key: string;
  /** Prefix written into the composed value, so the answer stays self-describing. */
  label: string;
  control: WizardControl;
  options?: WizardOption[];
  /** Rendered as a unit suffix on steppers ("ft"), never stored separately. */
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}

export interface WizardQuestion {
  /** Registry field_id. Resolvable in REGISTRY_FIELDS or this module throws at load. */
  fieldId: string;
  /** Registry label. */
  label: string;
  /** Registry interview_prompt — the question actually shown. */
  prompt: string;
  control: WizardControl;
  options?: WizardOption[];
  placeholder?: string;
  /** Tooltip copy (§2 "tooltips"). Explains why we ask, not what to type. */
  help?: string;
  /** Prefilled value (§2 "defaults"). Only ever a safe, common, editable answer. */
  defaultValue?: string;
  unit?: string;
  min?: number;
  max?: number;
  /** Composed follow-ups (§2 conditional questions). */
  compose?: WizardSubQuestion[];
  /** Registry applicability predicate; `always` means unconditional. */
  gatedBy: string;
  hardBlock: boolean;
  /** True for vault-routed fields. These never travel through proposed_updates. */
  secret: boolean;
  /** Canonical Brain section, derived — never hand-assigned. */
  section: string;
  sectionLabel: string;
  gapWeight: number;
}

export type WizardStepKind = 'core' | 'features' | 'questions' | 'documents';

export interface WizardStep {
  id: string;
  title: string;
  /** One sentence of orientation. Progressive disclosure starts with knowing why. */
  blurb: string;
  kind: WizardStepKind;
  questions: WizardQuestion[];
  /**
   * When present, the whole step is skipped unless the predicate is asserted.
   * Per-question gating still applies inside a shown step.
   */
  gatedBy?: string;
}

function reg(fieldId: string): RegistryField {
  const f = REGISTRY_FIELDS.find((r) => r.field_id === fieldId);
  // A typo here would silently drop a question from the interview and quietly
  // lower every property's achievable coverage, so it fails at module load.
  if (!f) throw new Error(`wizard references unknown registry field: ${fieldId}`);
  return f;
}

interface QuestionSpec {
  control: WizardControl;
  options?: WizardOption[];
  placeholder?: string;
  help?: string;
  defaultValue?: string;
  unit?: string;
  min?: number;
  max?: number;
  compose?: WizardSubQuestion[];
}

function question(fieldId: string, spec: QuestionSpec): WizardQuestion {
  const f = reg(fieldId);
  const resolved = brainSection(f.domain);
  if (!resolved) throw new Error(`registry domain has no Brain section: ${f.domain}`);
  const section = resolved.id;
  return {
    fieldId,
    label: f.label,
    prompt: f.interview_prompt,
    control: spec.control,
    options: spec.options,
    placeholder: spec.placeholder,
    help: spec.help,
    defaultValue: spec.defaultValue,
    unit: spec.unit,
    min: spec.min,
    max: spec.max,
    compose: spec.compose,
    gatedBy: f.applicability,
    hardBlock: f.hard_block,
    secret: f.type === 'secret',
    section,
    sectionLabel: sectionLabel(section),
    gapWeight: f.gap_weight,
  };
}

const YES_NO: WizardOption[] = [
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
];

/**
 * Counts the host enters on step 1 that the registry has no field for.
 *
 * They are stored exactly the way Phase C stores the same numbers when they come
 * off a listing page: one composed `brain.space_summary` entry. Adding registry
 * fields for them would change the denominator for every existing property.
 */
export interface SpaceCountsInput {
  floors: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: 'core',
    title: 'The basics',
    blurb: 'Where the property is and how big it is. Everything else builds on this.',
    kind: 'core',
    questions: [],
  },
  {
    id: 'features',
    title: 'What this place has',
    blurb:
      'Tick what applies. We only ask follow-up questions about things you actually have, and anything you mark as absent never counts against your Brain score.',
    kind: 'features',
    questions: [],
  },
  {
    id: 'arrival',
    title: 'Getting in',
    blurb: 'The questions guests ask most, and the ones that go wrong at 11pm.',
    kind: 'questions',
    questions: [
      question('checkin_time', {
        control: 'time',
        defaultValue: '16:00',
        help: 'Guests see this in the portal and the concierge quotes it exactly.',
      }),
      question('checkout_time', {
        control: 'time',
        defaultValue: '11:00',
        help: 'Required before you can share the portal with a guest.',
      }),
      question('entry_method', {
        control: 'select',
        options: [
          { value: 'Smart lock keypad', label: 'Smart lock keypad' },
          { value: 'Lockbox with a key', label: 'Lockbox with a key' },
          { value: 'Front desk or doorman', label: 'Front desk or doorman' },
          { value: 'Met in person by the host', label: 'Met in person by the host' },
          { value: 'Door is left unlocked', label: 'Door is left unlocked' },
        ],
        help: 'Pick the normal path. The backup below is what the concierge uses when that path fails.',
      }),
      question('door_code_or_entry_method', {
        control: 'secret',
        placeholder: '4–8 digits, or where the key is hidden',
        help: 'Stored encrypted in a vault, never shown in a chat transcript, and never sent to a guest without your rule allowing it.',
      }),
      question('access_backup_method', {
        control: 'textarea',
        placeholder: 'Spare key in the grey lockbox left of the porch, code 4821. Call me if that fails.',
        help: 'Without this, an entry answer is only ever half-credited — a code with no fallback is the single most common 11pm escalation.',
      }),
      question('checkin_flexibility', {
        control: 'textarea',
        placeholder: 'Early check-in from 1pm when the place is free, no fee. Just message first.',
      }),
      question('access_code_lifecycle', {
        control: 'textarea',
        placeholder: 'The keypad code changes automatically for each booking.',
        help: 'Only asked because you said this place has a smart lock.',
      }),
    ],
  },
  {
    id: 'layout',
    title: 'Getting around inside',
    blurb: 'You told us this place has more than one floor, so guests will ask about these.',
    kind: 'questions',
    gatedBy: 'is_multi_story',
    questions: [
      question('floor_number', {
        control: 'text',
        placeholder: 'Second floor',
      }),
      question('elevator_stairs', {
        control: 'textarea',
        placeholder: 'No lift. Two flights of stairs from the front door, fairly steep.',
        help: 'Guests with luggage, prams, or limited mobility ask this before they book.',
      }),
    ],
  },
  {
    id: 'departure',
    title: 'Leaving',
    blurb: 'What a guest has to do on the way out.',
    kind: 'questions',
    questions: [
      question('checkout_checklist', {
        control: 'textarea',
        placeholder: 'Strip the beds, load the dishwasher and start it, bins to the kerb, lock up.',
      }),
      question('late_checkout_policy', {
        control: 'textarea',
        placeholder: 'Late checkout to 2pm when nobody is arriving that day. Ask the morning before.',
      }),
      question('key_return_process', {
        control: 'textarea',
        placeholder: 'Keys back in the lockbox and scramble the dial.',
      }),
    ],
  },
  {
    id: 'connectivity',
    title: 'Wi-Fi',
    blurb: 'The most-asked question in every property, every stay.',
    kind: 'questions',
    gatedBy: 'has_wifi',
    questions: [
      question('wifi_network_name', {
        control: 'text',
        placeholder: 'Seaview-Guest',
        help: 'Exactly as it appears in the network list, including capitals and dashes.',
      }),
      question('wifi_password', {
        control: 'secret',
        help: 'Stored encrypted. On the next step you choose whether guests get it automatically or you approve each request.',
      }),
      question('wifi_troubleshooting', {
        control: 'textarea',
        placeholder: 'Router is in the hall cupboard. Unplug for 30 seconds and give it two minutes.',
        help: 'Without this, the Wi-Fi answers are only half-credited: a password with no fix-it step still generates a call.',
      }),
      question('wifi_speed_tier', {
        control: 'select',
        options: [
          { value: 'Basic — browsing and email', label: 'Basic — browsing and email' },
          { value: 'Good — HD streaming', label: 'Good — HD streaming' },
          { value: 'Fast — 4K and video calls', label: 'Fast — 4K and video calls' },
          { value: 'Fibre — work-from-home ready', label: 'Fibre — work-from-home ready' },
        ],
      }),
    ],
  },
  {
    id: 'parking',
    title: 'Parking',
    blurb: 'Where the car goes, and what happens when that space is taken.',
    kind: 'questions',
    questions: [
      question('parking', {
        control: 'textarea',
        placeholder: 'One dedicated space in the driveway, space number 4.',
        help: 'Required before you can share the portal. If there is no parking at all, mark parking as absent on the previous step instead of leaving this blank.',
      }),
      question('parking_access_instructions', {
        control: 'textarea',
        placeholder: 'Gate code 1150, then first left. The space is signed number 4.',
      }),
      question('parking_cost', {
        control: 'text',
        placeholder: 'Free for guests',
        defaultValue: 'Free for guests',
      }),
      question('parking_overflow_fallback', {
        control: 'textarea',
        placeholder: 'Second car on Mill Street, free after 6pm and all weekend.',
        help: 'Without this, the parking answer is only half-credited.',
      }),
    ],
  },
  {
    id: 'amenities',
    title: 'Using the place',
    blurb: 'How the things in the house actually work.',
    kind: 'questions',
    questions: [
      question('climate_control', {
        control: 'textarea',
        placeholder: 'Nest thermostat in the hall. Please keep it between 18 and 23.',
      }),
      question('appliance_list', {
        control: 'textarea',
        placeholder: 'Dishwasher, induction hob, Nespresso, air fryer, BBQ on the deck.',
      }),
      question('laundry_access', {
        control: 'textarea',
        placeholder: 'Washer-dryer in the utility room. Pods are under the sink.',
      }),
      question('pool_instructions', {
        control: 'textarea',
        placeholder: 'Anything else guests should know about the pool.',
        help: 'Only asked because you said this place has a pool.',
        compose: [
          { key: 'depth', label: 'Depth', control: 'stepper', unit: 'ft', min: 1, max: 30 },
          { key: 'heated', label: 'Heated', control: 'segmented', options: YES_NO },
          {
            key: 'placement',
            label: 'Indoor or outdoor',
            control: 'segmented',
            options: [
              { value: 'Indoor', label: 'Indoor' },
              { value: 'Outdoor', label: 'Outdoor' },
            ],
          },
          {
            key: 'rules',
            label: 'Pool rules',
            control: 'textarea',
            placeholder: 'No diving, no glass, children supervised at all times.',
          },
        ],
      }),
      question('hot_tub_instructions', {
        control: 'textarea',
        placeholder: 'Cover off, jets on the wall panel. Please replace the cover after use.',
        help: 'Only asked because you said this place has a hot tub.',
        compose: [
          { key: 'heated', label: 'Kept hot between stays', control: 'segmented', options: YES_NO },
          {
            key: 'rules',
            label: 'Hot tub rules',
            control: 'textarea',
            placeholder: 'No glass, quiet after 10pm, shower before use.',
          },
        ],
      }),
    ],
  },
  {
    id: 'rules',
    title: 'House rules and money',
    blurb: 'The things worth saying before a guest books, not after.',
    kind: 'questions',
    questions: [
      question('quiet_hours', {
        control: 'time_range',
        defaultValue: '22:00–08:00',
        help: 'The concierge quotes these when a neighbour complains.',
      }),
      question('smoking_policy', {
        control: 'select',
        options: [
          { value: 'No smoking anywhere on the property', label: 'No smoking anywhere' },
          { value: 'No smoking indoors; outside is fine', label: 'No smoking indoors' },
          { value: 'Smoking allowed', label: 'Smoking allowed' },
        ],
        defaultValue: 'No smoking anywhere on the property',
      }),
      question('trash_schedule', {
        control: 'textarea',
        placeholder: 'General waste Tuesday, recycling Friday. Bins live behind the side gate.',
      }),
      question('extra_guest_policy', {
        control: 'textarea',
        placeholder: 'No unregistered guests overnight. Day visitors are fine.',
      }),
      question('pet_policy', {
        control: 'select',
        options: [
          { value: 'No pets', label: 'No pets' },
          { value: 'Dogs welcome', label: 'Dogs welcome' },
          { value: 'Any well-behaved pet welcome', label: 'Any well-behaved pet welcome' },
          { value: 'Assistance animals only', label: 'Assistance animals only' },
        ],
      }),
      question('pet_fee', {
        control: 'stepper',
        min: 0,
        max: 500,
        unit: 'per stay',
        help: 'Only asked because you said pets are allowed.',
      }),
      question('age_child_policy', {
        control: 'textarea',
        placeholder: 'Family friendly. Travel cot and high chair in the cupboard on request.',
      }),
      question('minimum_stay', {
        control: 'stepper',
        min: 1,
        max: 60,
        unit: 'nights',
        defaultValue: '2',
      }),
      question('unexpected_charge_disclosure', {
        control: 'textarea',
        placeholder: 'Nothing beyond the booking total. Damage is charged at cost with photos.',
        help: 'The single most common source of a bad review. Say it up front.',
      }),
      question('deposit_damage_policy', {
        control: 'textarea',
        placeholder: '£250 hold released within 5 days of checkout.',
        help: 'Only asked because you said there is a deposit.',
      }),
      question('security_camera_disclosure', {
        control: 'textarea',
        placeholder: 'One doorbell camera facing the front path. Nothing inside, nothing facing the garden.',
        help: 'Only asked because you said there are exterior cameras. Most platforms require this disclosure.',
      }),
    ],
  },
  {
    id: 'safety',
    title: 'When something breaks',
    blurb: 'The answers that stop a small problem becoming a refund.',
    kind: 'questions',
    questions: [
      question('maintenance_emergency_contact', {
        control: 'contact',
        placeholder: 'Dave the handyman, +1 555 0134',
        help: 'Required before you can share the portal.',
      }),
      question('after_hours_escalation', {
        control: 'textarea',
        placeholder: 'Call me first. If I do not answer within 15 minutes call Dave on +1 555 0134.',
      }),
      question('utility_shutoff_locations', {
        control: 'textarea',
        placeholder: 'Water stopcock under the kitchen sink. Fuse board in the hall cupboard.',
        help: 'Kept host-only. Never shown to a guest.',
      }),
      question('appliance_troubleshooting', {
        control: 'textarea',
        placeholder: 'Oven trips the breaker if the air fryer is on at the same time. Reset in the hall cupboard.',
      }),
      question('plumbing_troubleshooting', {
        control: 'textarea',
        placeholder: 'Shower runs cold if the dishwasher is on. Plunger is behind the toilet.',
      }),
    ],
  },
  {
    id: 'local',
    title: 'The neighbourhood',
    blurb: 'Just enough to answer the first evening. You can build the full list later.',
    kind: 'questions',
    questions: [
      question('nearest_grocery', {
        control: 'place',
        placeholder: 'Tesco Express, 4 minutes on foot up Mill Street',
        help: 'Required before you can share the portal.',
      }),
      question('nearest_pharmacy', {
        control: 'place',
        placeholder: 'Boots on the high street, open until 6pm',
      }),
      question('transit_options', {
        control: 'textarea',
        placeholder: 'Bus 42 from the corner every 20 minutes. Station is a 12 minute walk.',
      }),
      question('restaurant_recommendations', {
        control: 'textarea',
        placeholder: 'The Anchor for dinner, Rosetta for pizza with kids, Bean There for coffee.',
      }),
      question('area_safety_notes', {
        control: 'textarea',
        placeholder: 'Quiet street. The path along the river is unlit after dark.',
      }),
    ],
  },
  {
    id: 'documents',
    title: 'Anything already written down',
    blurb:
      'Upload a house manual or paste your existing welcome message. We read it, split it up, and file each part in the right section for you to approve.',
    kind: 'documents',
    questions: [],
  },
];

/** Every registry field the wizard asks about, in step order. */
export const WIZARD_QUESTIONS: readonly WizardQuestion[] = WIZARD_STEPS.flatMap((s) => s.questions);

export const WIZARD_FIELD_IDS: readonly string[] = WIZARD_QUESTIONS.map((q) => q.fieldId);

/** Predicates the features step asks about — registry-filtered, so no dead questions. */
export const WIZARD_PREDICATES: readonly string[] = APPLICABILITY_PREDICATES;

export function predicateLabel(predicate: string): string {
  return APPLICABILITY_LABELS[predicate] ?? predicate.replace(/_/g, ' ');
}

/** Steps a host actually walks, given the predicates they asserted. */
export function visibleSteps(applicable: readonly string[]): WizardStep[] {
  const set = new Set(applicable);
  return WIZARD_STEPS.filter((s) => !s.gatedBy || set.has(s.gatedBy)).map((s) => ({
    ...s,
    questions: s.questions.filter((q) => q.gatedBy === 'always' || set.has(q.gatedBy)),
  })).filter((s) => s.kind !== 'questions' || s.questions.length > 0);
}

export function visibleQuestions(applicable: readonly string[]): WizardQuestion[] {
  return visibleSteps(applicable).flatMap((s) => s.questions);
}

/**
 * Coverage the wizard reaches when a given set of its questions is answered.
 *
 * This calls the real `computeCompleteness` over the real registry rather than
 * counting questions, because §2's target is stated on the Coverage Map's scale
 * and the Coverage Map is weighted. Counting 32 of 53 fields would be a different
 * number from the one the host is shown.
 *
 * `requires_on_failure` is honoured: answering `wifi_password` without
 * `wifi_troubleshooting` scores 0.5, exactly as the Brain page will show it.
 */
export function wizardCoverage(input: {
  applicable: readonly string[];
  answered: readonly string[];
}): number {
  const answered = new Set(input.answered);
  const statuses: Record<string, FieldStatus> = {};
  for (const f of REGISTRY_FIELDS) {
    if (!answered.has(f.field_id)) continue;
    const fallbackOk = !f.requires_on_failure || answered.has(f.on_failure_field ?? '');
    statuses[f.field_id] = fallbackOk ? 'satisfied' : 'partial';
  }
  return computeCompleteness({ statuses, applicable: input.applicable }).pct;
}

/**
 * Coverage if the host completes every question the wizard shows them.
 *
 * §2's "≥65%" is measured HERE — before the final document step — deliberately.
 * The document step depends on the host having a house manual to upload, which
 * many do not, so a target that only clears once a file is parsed would be a
 * target the wizard does not actually meet on its own.
 */
export function fullWizardCoverage(applicable: readonly string[]): number {
  return wizardCoverage({
    applicable,
    answered: visibleQuestions(applicable).map((q) => q.fieldId),
  });
}

export const WIZARD_COVERAGE_TARGET = COMPLETENESS_SHIP_THRESHOLD;

/**
 * Composes a parent field's value from its sub-answers.
 *
 * Labelled rather than concatenated so the stored sentence still reads as prose
 * to the concierge while remaining unambiguous to a host re-reading it later.
 */
export function composeValue(
  q: WizardQuestion,
  sub: Readonly<Record<string, string>>,
  freeText: string,
): string {
  const parts: string[] = [];
  for (const s of q.compose ?? []) {
    const raw = (sub[s.key] ?? '').trim();
    if (raw.length === 0) continue;
    const value = s.unit ? `${raw} ${s.unit}` : raw;
    parts.push(`${s.label}: ${value}.`);
  }
  const tail = freeText.trim();
  if (tail.length > 0) parts.push(tail);
  return parts.join(' ').trim();
}

/**
 * The counts from step 1, rendered as one `brain.space_summary` body.
 *
 * Mirrors what Phase C's listing extraction produces for the same numbers, so a
 * property onboarded manually and one onboarded from a link end up with the same
 * shape of entry in the same section.
 */
export function composeSpaceSummary(counts: SpaceCountsInput): string | null {
  const parts: string[] = [];
  if (counts.bedrooms !== null) parts.push(`${counts.bedrooms} bedroom${counts.bedrooms === 1 ? '' : 's'}`);
  if (counts.bathrooms !== null) parts.push(`${counts.bathrooms} bathroom${counts.bathrooms === 1 ? '' : 's'}`);
  if (counts.floors !== null) parts.push(`${counts.floors} floor${counts.floors === 1 ? '' : 's'}`);
  if (counts.squareFeet !== null) parts.push(`${counts.squareFeet} square feet`);
  if (parts.length === 0) return null;
  return `This property has ${parts.join(', ')}.`;
}

/**
 * `is_multi_story` is derived from the floor count rather than asked twice.
 *
 * Returns null when the host left floors blank: absent and false score
 * identically, and asserting a false the host never stated would remove
 * `elevator_stairs` and `floor_number` from their denominator on our guess.
 */
export function derivedMultiStory(floors: number | null): boolean | null {
  if (floors === null) return null;
  return floors > 1;
}
