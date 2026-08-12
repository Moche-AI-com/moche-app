import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORT_ATTESTATION_TEXT } from './attestation';

// The attestation is a legal control, not a UI nicety (Directive Section 0.4,
// D-0013). These are source assertions because the value of the control is that
// no import path can skip it — a runtime test of one happy path would not catch a
// future route that forgets the check.
const route = readFileSync('app/api/property-imports/route.ts', 'utf8');
const form = readFileSync('app/dashboard/properties/new/ListingImportForm.tsx', 'utf8');
const jobs = readFileSync('lib/property-import/jobs.ts', 'utf8');

describe('import ownership attestation', () => {
  it('states what the host is agreeing to, in first person', () => {
    expect(IMPORT_ATTESTATION_TEXT).toMatch(/own or manage/i);
    expect(IMPORT_ATTESTATION_TEXT.startsWith('I ')).toBe(true);
  });

  it('is required by the API as a literal true, so an omitted flag fails', () => {
    expect(route).toContain('attested: z.literal(true)');
  });

  it('is persisted with the job rather than only shown in the UI', () => {
    expect(jobs).toContain('ownership_attested_at');
    expect(jobs).toContain('attestation_text: IMPORT_ATTESTATION_TEXT');
  });

  it('renders the same wording that gets stored', () => {
    expect(form).toContain('IMPORT_ATTESTATION_TEXT');
    // The label must not hardcode a second copy of the sentence that gets stored.
    // (The validation error message legitimately mentions ownership; that is
    // different text and is not what the host attests to.)
    expect(form).not.toContain(IMPORT_ATTESTATION_TEXT);
  });

  it('blocks submission until the host checks the box', () => {
    expect(form).toContain('disabled={loading || !attested}');
  });
});

describe('import provenance purge', () => {
  const action = readFileSync(
    'app/dashboard/properties/[id]/brain/import-provenance-actions.ts',
    'utf8',
  );

  it('requires edit permission', () => {
    expect(action).toContain('access.can.editBrain');
  });

  it('deletes only the imported source material, never the property', () => {
    expect(action).toContain('property_import_purge');
    expect(action).not.toMatch(/from\('properties'\)\s*\.delete/);
  });
});
