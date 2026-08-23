// Structural guards for the AI Updates surface (§3, §9).
//
// Written in the same style as test/brain-page-structure.test.ts, and for the same
// reason: each thing asserted here is a property that was deliberately arranged
// and would be easy to undo by accident.
//
// The four properties being protected:
//   1. One name. The surface used to be "Updates" in the route and "Knowledge
//      Queue" in the heading. Both spellings are now derived from one constant.
//   2. Per-property scoping. The tab's queries must filter by property_id, and
//      must not carry the account-wide .in('property_id', ...) form — a copy-paste
//      of the old page into the tab would otherwise render every property's rows
//      inside one property's breadcrumb.
//   3. No second manager. The account-wide roll-up counts and links; it must not
//      render the decision component or the decision endpoint again.
//   4. No global nav tab.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Comments are stripped: each file explains what it does not do, in prose that
 *  names the very strings being asserted absent. */
function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

const tab = read('app/dashboard/properties/[id]/updates/page.tsx');
const rollup = read('app/dashboard/updates/page.tsx');
const nav = read('app/dashboard/properties/[id]/PropertyWorkspaceNav.tsx');
const primaryNav = read('components/dashboard/DashboardNav.tsx');
const tile = read('components/dashboard/UpdateQueueCard.tsx');

describe('AI Updates naming', () => {
  it('derives every user-visible name from one constant', () => {
    for (const [label, source] of [
      ['tab', tab],
      ['roll-up', rollup],
      ['nav', nav],
      ['tile', tile],
    ] as const) {
      expect(source, label).toContain('AI_UPDATES_LABEL');
      expect(source, label).not.toContain('Knowledge Queue');
      expect(source, label).not.toContain('Knowledge awaiting review');
    }
  });

  it('never calls the surface a review, which to a host means a guest rating', () => {
    for (const source of [tab, rollup, nav, tile]) {
      expect(source).not.toMatch(/>\s*Reviews?\s*</);
    }
  });
});

describe('per-property AI Updates tab', () => {
  it('resolves access through the property guard before reading anything', () => {
    expect(tab).toContain('requirePropertyAccess');
    const guardAt = tab.indexOf('requirePropertyAccess(propertyId)');
    const queryAt = tab.indexOf("from('proposed_updates')");
    expect(guardAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(guardAt);
  });

  it('filters every proposal query by this property and never by a property list', () => {
    const queries = tab.split("from('proposed_updates')").slice(1);
    expect(queries.length).toBeGreaterThanOrEqual(3);
    for (const q of queries) {
      expect(q).toContain(".eq('property_id', propertyId)");
    }
    // The account-wide form. Its presence here would mean the tab shows other
    // properties' rows under this property's breadcrumb.
    expect(tab).not.toContain(".in('property_id'");
  });

  it('uses the request-scoped client so RLS applies, never the service-role client', () => {
    expect(tab).toContain("from '@/lib/supabase/server'");
    expect(tab).not.toContain('createAdminClient');
    expect(tab).not.toContain('hasServiceRole');
  });

  it('grants decision rights only when the caller may edit this Brain', () => {
    expect(tab).toContain('access.can.editBrain ? [propertyId] : []');
  });

  it('hides the redundant property name on rows', () => {
    expect(tab).toContain('showPropertyName={false}');
  });
});

describe('account-wide roll-up stays an index', () => {
  it('renders no decision component and no decision endpoint', () => {
    expect(rollup).not.toContain('AiUpdatesQueue');
    expect(rollup).not.toContain('UpdateQueueClient');
    expect(rollup).not.toContain('/updates/');
    expect(rollup).not.toMatch(/>\s*(Approve|Decline|Edit first)\s*</);
  });

  it('hands a single-property deep link straight to that property', () => {
    expect(rollup).toContain('redirect(propertyAiUpdatesHref(scopedPropertyId, view))');
  });

  it('resolves the deep link against the caller own property list, so scope can only narrow', () => {
    expect(rollup).toContain('resolveScope(requestedProperty, allPropIds)');
    const resolveAt = rollup.indexOf('resolveScope(');
    const redirectAt = rollup.indexOf('redirect(');
    expect(resolveAt).toBeLessThan(redirectAt);
  });

  it('scopes its tally to the account properties', () => {
    expect(rollup).toContain("eq('host_account_id', ctx.account.id)");
    expect(rollup).toContain(".in('property_id', allPropIds)");
  });
});

describe('navigation placement', () => {
  it('has no global Updates tab in the primary dashboard nav', () => {
    expect(primaryNav).not.toContain("'/dashboard/updates'");
  });

  it('places AI Updates directly after Brain in the property tab rail', () => {
    const brainAt = nav.indexOf("key: 'brain'");
    const updatesAt = nav.indexOf("key: 'updates'");
    const staysAt = nav.indexOf("key: 'stays'");
    expect(brainAt).toBeGreaterThan(-1);
    expect(updatesAt).toBeGreaterThan(brainAt);
    expect(staysAt).toBeGreaterThan(updatesAt);
  });

  it('shows both tabs to read-only viewers rather than hiding the surface', () => {
    // Both sit above the canEditProperty branch that gates Extras and Configuration.
    const gateAt = nav.indexOf('if (canEditProperty)');
    expect(nav.indexOf("key: 'brain'")).toBeLessThan(gateAt);
    expect(nav.indexOf("key: 'updates'")).toBeLessThan(gateAt);
  });
});
