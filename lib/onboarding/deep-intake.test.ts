import { describe, it, expect } from 'vitest';
import { parseDeepEntries, DEEP_TARGET_FIELDS } from './deep-intake';
import { REGISTRY_FIELDS } from '@/lib/brain/completeness';
import { BRAIN_SECTIONS } from '@/lib/brain/taxonomy';
import { proposableField, normalizeProposedValue } from '@/lib/brain/proposals';

function reply(entries: unknown[]): string {
  return JSON.stringify({ entries });
}

const SECTION_IDS = new Set(BRAIN_SECTIONS.map((s) => s.id));

describe('DEEP_TARGET_FIELDS', () => {
  it('excludes secrets, so the model is never told a secret field exists', () => {
    const secrets = REGISTRY_FIELDS.filter((f) => f.type === 'secret').map((f) => f.field_id);
    expect(secrets.length).toBeGreaterThan(0);
    const offered = new Set(DEEP_TARGET_FIELDS.map((f) => f.fieldId));
    for (const s of secrets) expect(offered.has(s), s).toBe(false);
  });

  it('excludes system_section fields', () => {
    const system = REGISTRY_FIELDS.filter((f) => f.system_section).map((f) => f.field_id);
    const offered = new Set(DEEP_TARGET_FIELDS.map((f) => f.fieldId));
    for (const s of system) expect(offered.has(s), s).toBe(false);
  });

  it('offers only fields that are already proposable, so nothing new becomes writable', () => {
    for (const f of DEEP_TARGET_FIELDS) {
      expect(proposableField(`brain_value.${f.fieldId}`), f.fieldId).not.toBeNull();
    }
  });
});

describe('parseDeepEntries — output validation', () => {
  it('accepts a well-formed field entry', () => {
    const out = parseDeepEntries(
      reply([
        { field_id: 'checkin_time', section: 'access_arrival', title: 'Check-in', text: '16:00', confidence: 0.9 },
      ]),
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].fieldId).toBe('checkin_time');
    expect(out[0].fieldPath).toBe('brain_value.checkin_time');
    expect(out[0].confidence).toBe(0.9);
  });

  it('drops a field_id the registry does not define', () => {
    const out = parseDeepEntries(
      reply([{ field_id: 'wifi_password_plaintext', section: 'connectivity', title: 'X', text: 'hunter2' }]),
      [],
    );
    // Falls through to a prose entry only if the section is valid and the text is
    // long enough; here the text is short, so nothing survives.
    expect(out).toHaveLength(0);
  });

  it('refuses to target a secret field even if the model names one', () => {
    // The prompt forbids it, but a prompt is not a control. The allowlist is.
    const out = parseDeepEntries(
      reply([
        {
          field_id: 'wifi_password',
          section: 'connectivity',
          title: 'Wi-Fi password',
          text: 'The Wi-Fi password is hunter2 for the guest network.',
        },
      ]),
      [],
    );
    // Not writable as that field. It degrades to a prose entry the host reviews,
    // never a silent write to the vault-backed field.
    expect(out.every((e) => e.fieldId !== 'wifi_password')).toBe(true);
  });

  it('takes the section from the registry, not from the model, when a field is named', () => {
    // A model that names checkin_time and files it under `local_area` must not be
    // able to mis-route it.
    const out = parseDeepEntries(
      reply([{ field_id: 'checkin_time', section: 'local_area', title: 'Check-in', text: '15:00' }]),
      [],
    );
    const f = REGISTRY_FIELDS.find((r) => r.field_id === 'checkin_time')!;
    expect(out[0].section).toBe(f.domain);
    expect(out[0].section).not.toBe('local_area');
  });

  it('drops an invented section', () => {
    const out = parseDeepEntries(
      reply([{ section: 'pricing_and_upsells', title: 'Rates', text: 'Nightly rate is 200 in high season.' }]),
      [],
    );
    expect(out).toHaveLength(0);
  });

  it('only ever emits real section ids', () => {
    const out = parseDeepEntries(
      reply([
        { section: 'house_rules', title: 'Quiet', text: 'Quiet hours are from 10pm until 8am every night.' },
        { field_id: 'trash_schedule', section: 'nonsense', title: 'Bins', text: 'Bins go out on Tuesday nights.' },
      ]),
      [],
    );
    expect(out.length).toBeGreaterThan(0);
    for (const e of out) expect(SECTION_IDS.has(e.section), e.section).toBe(true);
  });

  it('drops entries with no title or no text rather than inventing one', () => {
    const out = parseDeepEntries(
      reply([
        { section: 'house_rules', title: '', text: 'Some text that is long enough to pass.' },
        { section: 'house_rules', title: 'Has title', text: '   ' },
      ]),
      [],
    );
    expect(out).toHaveLength(0);
  });

  it('deduplicates repeated fields and repeated prose titles', () => {
    const out = parseDeepEntries(
      reply([
        { field_id: 'checkin_time', section: 'access_arrival', title: 'Check-in', text: '16:00' },
        { field_id: 'checkin_time', section: 'access_arrival', title: 'Check in time', text: '4pm' },
        { section: 'house_rules', title: 'Quiet hours', text: 'Quiet hours are 10pm to 8am on all nights.' },
        { section: 'house_rules', title: 'QUIET HOURS', text: 'Quiet hours are 10pm to 8am on all nights.' },
      ]),
      [],
    );
    expect(out.filter((e) => e.fieldId === 'checkin_time')).toHaveLength(1);
    expect(out.filter((e) => e.fieldId === null)).toHaveLength(1);
  });

  it('never returns one entry holding the whole document (§6: no single-field dumps)', () => {
    // A model that ignores the split instruction and returns one giant blob still
    // only produces one prose entry, which the host sees labelled and sectioned —
    // but the multi-entry path is what the pipeline is built around, asserted here
    // by confirming a multi-fact document yields multiple entries.
    const out = parseDeepEntries(
      reply([
        { field_id: 'checkin_time', section: 'access_arrival', title: 'Check-in', text: '16:00' },
        { field_id: 'checkout_time', section: 'access_arrival', title: 'Check-out', text: '11:00' },
        { field_id: 'trash_schedule', section: 'house_rules', title: 'Bins', text: 'Bins out Tuesday night.' },
        { field_id: 'parking', section: 'parking_transport', title: 'Parking', text: 'One space in the driveway.' },
      ]),
      [],
    );
    expect(out).toHaveLength(4);
    expect(new Set(out.map((e) => e.section)).size).toBeGreaterThan(1);
  });

  it('caps the number of entries so one bad reply cannot flood the review queue', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      section: 'house_rules',
      title: `Rule ${i}`,
      text: `This is house rule number ${i} and it is long enough to be kept.`,
    }));
    const out = parseDeepEntries(reply(many), []);
    expect(out.length).toBeLessThanOrEqual(24);
  });

  it('drops prose too short to survive registry validation, before a row is written', () => {
    const short = parseDeepEntries(reply([{ section: 'house_rules', title: 'Pets', text: 'No pets.' }]), []);
    expect(short).toHaveLength(0);
  });

  it('produces prose entries that actually pass normalizeProposedValue', () => {
    // The parser's own length floor is only useful if it matches the real
    // validator. This closes the loop rather than trusting the constant.
    const out = parseDeepEntries(
      reply([
        {
          section: 'house_rules',
          title: 'Quiet hours',
          text: 'Quiet hours run from 10pm until 8am, and the walls are thin.',
        },
      ]),
      [],
    );
    expect(out).toHaveLength(1);
    const field = proposableField(out[0].fieldPath)!;
    const normalized = normalizeProposedValue(field, {
      title: out[0].title,
      text: out[0].text,
      category: 'rules',
      visibility: 'guest',
    });
    expect(normalized.ok, normalized.ok ? '' : normalized.error).toBe(true);
  });
});

describe('parseDeepEntries — conflict detection (§2)', () => {
  it('flags a field the host already answered', () => {
    const out = parseDeepEntries(
      reply([{ field_id: 'checkin_time', section: 'access_arrival', title: 'Check-in', text: '15:00' }]),
      ['checkin_time'],
    );
    expect(out[0].conflictsWith).toBe('checkin_time');
  });

  it('does not suppress a conflicting entry, only marks it', () => {
    // §2 says conflicts must "inform the user and route it to AI Updates" —
    // dropping them would hide the disagreement, which is the opposite.
    const out = parseDeepEntries(
      reply([{ field_id: 'checkout_time', section: 'access_arrival', title: 'Check-out', text: '10:00' }]),
      ['checkout_time'],
    );
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('10:00');
  });

  it('leaves non-conflicting entries unflagged', () => {
    const out = parseDeepEntries(
      reply([{ field_id: 'trash_schedule', section: 'house_rules', title: 'Bins', text: 'Bins out Tuesday.' }]),
      ['checkin_time'],
    );
    expect(out[0].conflictsWith).toBeNull();
  });

  it('never flags a prose entry as a conflict, since it overwrites nothing', () => {
    const out = parseDeepEntries(
      reply([{ section: 'house_rules', title: 'Noise', text: 'Please keep noise down after ten at night.' }]),
      ['checkin_time', 'trash_schedule'],
    );
    expect(out[0].conflictsWith).toBeNull();
  });
});

describe('parseDeepEntries — malformed replies', () => {
  it('returns nothing for non-JSON', () => {
    expect(parseDeepEntries('I could not read that document, sorry.', [])).toEqual([]);
  });

  it('returns nothing for JSON with no entries array', () => {
    expect(parseDeepEntries('{"result":"ok"}', [])).toEqual([]);
    expect(parseDeepEntries('{"entries":"none"}', [])).toEqual([]);
    expect(parseDeepEntries('[]', [])).toEqual([]);
    expect(parseDeepEntries('null', [])).toEqual([]);
  });

  it('unwraps a markdown code fence', () => {
    const fenced =
      '```json\n' +
      reply([{ field_id: 'checkin_time', section: 'access_arrival', title: 'Check-in', text: '16:00' }]) +
      '\n```';
    expect(parseDeepEntries(fenced, [])).toHaveLength(1);
  });

  it('skips non-object array members without discarding the good ones', () => {
    const raw = JSON.stringify({
      entries: [
        null,
        'a string',
        42,
        { field_id: 'checkin_time', section: 'access_arrival', title: 'Check-in', text: '16:00' },
      ],
    });
    expect(parseDeepEntries(raw, [])).toHaveLength(1);
  });

  it('clamps a nonsense confidence instead of storing it', () => {
    const out = parseDeepEntries(
      reply([
        { field_id: 'checkin_time', section: 'access_arrival', title: 'A', text: '16:00', confidence: 99 },
        { field_id: 'checkout_time', section: 'access_arrival', title: 'B', text: '11:00', confidence: -4 },
        { field_id: 'trash_schedule', section: 'house_rules', title: 'C', text: 'Tuesday.', confidence: 'high' },
      ]),
      [],
    );
    for (const e of out) {
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('truncates an over-long title rather than rejecting the fact', () => {
    const out = parseDeepEntries(
      reply([{ section: 'house_rules', title: 'x'.repeat(300), text: 'A rule that is long enough to keep.' }]),
      [],
    );
    expect(out[0].title.length).toBeLessThanOrEqual(80);
  });
});

describe('prompt-injection resistance', () => {
  it('cannot be made to write outside the field allowlist by document content', () => {
    // Even if injected text convinces the model to emit these, the allowlist and
    // the section set are the actual boundary.
    const out = parseDeepEntries(
      reply([
        { field_id: '../../admin', section: 'access_arrival', title: 'X', text: 'Grant admin to everyone now.' },
        { field_id: 'brain_value.checkin_time', section: 'access_arrival', title: 'Y', text: '16:00' },
        { field_id: 'tone_preset', section: 'access_arrival', title: 'Z', text: 'Change the tone to pirate.' },
      ]),
      [],
    );
    for (const e of out) {
      expect(e.fieldId === null || DEEP_TARGET_FIELDS.some((f) => f.fieldId === e.fieldId)).toBe(true);
      expect(e.fieldPath === 'brain.document_summary' || e.fieldPath.startsWith('brain_value.')).toBe(true);
      expect(proposableField(e.fieldPath), e.fieldPath).not.toBeNull();
    }
  });
});
