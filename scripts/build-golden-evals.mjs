#!/usr/bin/env node
// Generates the versioned golden evaluation suite (directive §7.0).
//
// Deterministic by construction: every choice below is a function of the field's index in
// the registry, never of a random number or of the clock. Re-running on an unchanged
// registry must produce a byte-identical file, because CI checks the committed suite
// against a fresh generation the same way it checks field-registry drift.
//
// Usage: node scripts/build-golden-evals.mjs [--check]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'evals', 'golden-v1.json');
const SUITE_VERSION = 1;

// A fixed instant so ttl_expires_at values in the suite are stable. Cases are graded
// against this same `now`, so the suite never rots into a different verdict tomorrow.
const NOW = '2026-06-01T12:00:00.000Z';
const EXPIRED = '2026-05-01T12:00:00.000Z';
const FRESH = '2027-06-01T12:00:00.000Z';

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'field_registry.json'), 'utf8'));

/**
 * Property archetypes. Each declares which applicability predicates hold, which drives
 * both the answerable set and the not_applicable cases. Chosen so the three differ in
 * ways that have historically caused bugs: a unit with no Wi-Fi at all, a unit with
 * amenities but no parking, and a fully-loaded multi-story house.
 */
const ARCHETYPES = [
  {
    id: 'urban_studio_no_parking',
    label: 'Urban studio, no parking, no pool',
    predicates: ['always', 'has_wifi', 'has_laundry', 'has_smart_lock', 'charges_deposit'],
  },
  {
    id: 'offgrid_cabin_no_wifi',
    label: 'Off-grid cabin, no Wi-Fi, hot tub, pets allowed',
    predicates: ['always', 'has_hot_tub', 'has_parking', 'allows_pets'],
  },
  {
    id: 'multistory_beach_house',
    label: 'Multi-story beach house, pool, cameras, elevator',
    predicates: [
      'always',
      'has_wifi',
      'has_pool',
      'has_parking',
      'has_laundry',
      'is_multi_story',
      'has_elevator',
      'has_security_cameras',
    ],
  },
];

// Four paraphrase shapes per field. Guests do not phrase questions like registry labels,
// and a suite that only asks in registry vocabulary would overstate coverage.
const PARAPHRASES = [
  (f) => `What is the ${lower(f.label)}?`,
  (f) => `Can you tell me about the ${lower(f.label)}?`,
  (f) => f.interview_prompt ? stripHostVoice(f.interview_prompt) : `Where do I find the ${lower(f.label)}?`,
  (f) => `${lower(f.label)}?`,
];

function lower(s) {
  // Preserve intentional capitals (Wi-Fi, PMS) but drop a leading sentence capital.
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Registry interview prompts address the host; the eval asks as a guest. */
function stripHostVoice(prompt) {
  return prompt
    .replace(/\bdoes a guest\b/gi, 'do I')
    .replace(/\bthe guest\b/gi, 'I')
    .replace(/\bguests\b/gi, 'we')
    .replace(/\byour\b/gi, 'the');
}

/**
 * Case shapes, cycled deterministically. Weighted so unanswerable cases (every shape
 * whose expected status is not `answered`) land above the 30% floor §7.0 requires
 * without swamping the answerable path.
 */
const SHAPES = [
  'answerable',
  'absent',
  'answerable',
  'expired',
  'answerable',
  'empty',
  'answerable',
  'wrong_audience',
  'answerable',
  'closed_window',
];

function sampleValue(field) {
  switch (field.type) {
    case 'time':
      return '11:00 AM';
    case 'number':
      return '2';
    case 'boolean':
      return 'true';
    case 'enum':
      return (field.enum_values && field.enum_values[0]) ?? 'other';
    case 'phone':
      return '+1 555 0100';
    case 'url':
      return 'https://example.test/info';
    default:
      return `Recorded value for ${field.label}.`;
  }
}

/** The audience a guest question is asked under, and one that must be refused. */
function permittedAudience(tier) {
  const permitted = registry.audience_matrix[tier] ?? [];
  // Prefer the narrowest guest audience that is permitted; fall back to host_private for
  // host_only fields so an "answerable" case is genuinely answerable.
  for (const a of ['guest_instay', 'guest_prearrival', 'guest_public', 'staff_ops', 'host_private']) {
    if (permitted.includes(a)) return a;
  }
  return 'host_private';
}

function deniedAudience(tier) {
  const permitted = registry.audience_matrix[tier] ?? [];
  for (const a of ['guest_public', 'guest_prearrival', 'guest_instay', 'staff_ops']) {
    if (!permitted.includes(a)) return a;
  }
  return null;
}

function build() {
  // Guest-facing evaluation covers guest-answerable fields. System sections are excluded
  // per D-0015 (never proposable, never guest-visible), so asking about them would test
  // nothing but the exclusion itself.
  const fields = registry.fields.filter((f) => !f.system_section);

  const archetypes = ARCHETYPES.map((arch) => {
    const applicable = new Set(arch.predicates);
    const inapplicable = fields
      .filter((f) => !applicable.has(f.applicability))
      .map((f) => f.field_id)
      .sort();
    const inapplicableSet = new Set(inapplicable);

    const cases = [];
    let shapeIdx = 0;

    for (const field of fields) {
      for (let v = 0; v < PARAPHRASES.length; v += 1) {
        const question = PARAPHRASES[v](field);
        const caseId = `${arch.id}:${field.field_id}:${v}`;

        if (inapplicableSet.has(field.field_id)) {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: permittedAudience(field.sensitivity_tier),
            access_window_ok: true,
            expected: { status: 'not_applicable', reason: 'not_applicable', knowledge_gap: false },
          });
          continue;
        }

        let shape = SHAPES[shapeIdx % SHAPES.length];
        shapeIdx += 1;

        // A wrong-audience case is only meaningful when some audience is actually denied.
        if (shape === 'wrong_audience' && !deniedAudience(field.sensitivity_tier)) shape = 'absent';
        // A closed-window case only applies to stay-scoped secrets.
        if (shape === 'closed_window' && field.sensitivity_tier !== 'stay_scoped_secret') shape = 'expired';

        const permitted = permittedAudience(field.sensitivity_tier);

        if (shape === 'answerable') {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: permitted,
            access_window_ok: true,
            expected: { status: 'answered', reason: null, knowledge_gap: false },
          });
        } else if (shape === 'absent') {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: permitted,
            access_window_ok: true,
            // Deliberately unanswerable: the host has never recorded this fact.
            expected: { status: 'needs_host', reason: 'absent', knowledge_gap: true },
            unanswerable: true,
          });
        } else if (shape === 'empty') {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: permitted,
            access_window_ok: true,
            expected: { status: 'needs_host', reason: 'empty', knowledge_gap: true },
            unanswerable: true,
          });
        } else if (shape === 'expired') {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: permitted,
            access_window_ok: true,
            expected: { status: 'needs_host', reason: 'expired', knowledge_gap: true },
            unanswerable: true,
          });
        } else if (shape === 'wrong_audience') {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: deniedAudience(field.sensitivity_tier),
            access_window_ok: true,
            expected: { status: 'refused', reason: 'audience_denied', knowledge_gap: false },
            unanswerable: true,
          });
        } else {
          cases.push({
            id: caseId,
            question,
            field_id: field.field_id,
            audience: permitted,
            access_window_ok: false,
            expected: { status: 'refused', reason: 'access_window_closed', knowledge_gap: false },
            unanswerable: true,
          });
        }
      }
    }

    // A field can appear in several shapes across its paraphrases; the LAST fact written
    // wins in `facts`, which would contradict earlier cases. Split per-case fact
    // overrides instead of relying on a shared snapshot.
    return {
      id: arch.id,
      label: arch.label,
      applicable_predicates: arch.predicates,
      inapplicable_field_ids: inapplicable,
      cases: cases.map((c) => ({ ...c, fact: factFor(c, fields) })),
    };
  });

  return {
    suite_version: SUITE_VERSION,
    generator: 'scripts/build-golden-evals.mjs',
    governing_section: 'Moche-AI Unified Build Directive §7.0',
    registry_version: registry.registry_version,
    graded_at: NOW,
    grades:
      'Deterministic direct-fact resolution (lib/evals/resolve.ts): existence, emptiness, TTL, audience, access window. Generation quality is judged separately and is not graded here.',
    archetypes,
  };

  function factFor(c, allFields) {
    const field = allFields.find((f) => f.field_id === c.field_id);
    const tier = field.sensitivity_tier;
    switch (c.expected.reason) {
      case 'absent':
      case 'not_applicable':
        return null;
      case 'empty':
        return { fieldId: c.field_id, sensitivityTier: tier, value: '   ', ttlExpiresAt: FRESH };
      case 'expired':
        return { fieldId: c.field_id, sensitivityTier: tier, value: sampleValue(field), ttlExpiresAt: EXPIRED };
      default:
        return { fieldId: c.field_id, sensitivityTier: tier, value: sampleValue(field), ttlExpiresAt: FRESH };
    }
  }
}

const suite = build();
const json = `${JSON.stringify(suite, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (existing !== json) {
    console.error('Golden eval suite drift: evals/golden-v1.json does not match the generator.');
    console.error('Run: node scripts/build-golden-evals.mjs');
    process.exit(1);
  }
  console.log('Golden eval suite is in sync.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json);
const total = suite.archetypes.reduce((n, a) => n + a.cases.length, 0);
for (const a of suite.archetypes) {
  const un = a.cases.filter((c) => c.expected.status !== 'answered').length;
  console.log(`${a.id}: ${a.cases.length} cases, ${un} unanswerable (${Math.round((un / a.cases.length) * 100)}%)`);
}
console.log(`total ${total} cases -> evals/golden-v1.json`);
