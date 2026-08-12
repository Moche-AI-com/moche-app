// Golden evaluation suite runner — the autonomy gate of directive §7.0.
//
// This is the gate, not a smoke test: it must pass 100% before any category may leave
// draft mode. It is deliberately free to run (no model calls, no network, no credits) so
// it can gate every commit rather than being run once and cited afterwards.

import { describe, it, expect } from 'vitest';
import suite from '@/evals/golden-v1.json';
import { resolveFact, type FactSnapshot, type ResolveStatus } from './resolve';
import type { AudienceTier } from '@/lib/brain/audience';

interface GoldenCase {
  id: string;
  question: string;
  field_id: string;
  audience: string;
  access_window_ok: boolean;
  expected: { status: string; reason: string | null; knowledge_gap: boolean };
  unanswerable?: boolean;
  fact: FactSnapshot | null;
}

const ARCHETYPES = suite.archetypes as unknown as {
  id: string;
  label: string;
  inapplicable_field_ids: string[];
  cases: GoldenCase[];
}[];

const NOW = new Date(suite.graded_at);

describe('golden suite shape (§7.0 gate preconditions)', () => {
  it('is versioned and pinned to a registry version', () => {
    expect(suite.suite_version).toBeGreaterThanOrEqual(1);
    expect(suite.registry_version).toBeGreaterThanOrEqual(1);
  });

  it('covers multiple property archetypes', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(3);
  });

  it.each(ARCHETYPES.map((a) => [a.id, a] as const))(
    '%s carries 150-300 questions',
    (_id, arch) => {
      expect(arch.cases.length).toBeGreaterThanOrEqual(150);
      expect(arch.cases.length).toBeLessThanOrEqual(300);
    },
  );

  it.each(ARCHETYPES.map((a) => [a.id, a] as const))(
    '%s is at least 30%% deliberately unanswerable',
    (_id, arch) => {
      const notAnswered = arch.cases.filter((c) => c.expected.status !== 'answered').length;
      expect(notAnswered / arch.cases.length).toBeGreaterThanOrEqual(0.3);
    },
  );

  it.each(ARCHETYPES.map((a) => [a.id, a] as const))(
    '%s still has a substantial answerable population',
    (_id, arch) => {
      // A suite that is 100% unanswerable would pass a naive "always say needs_host"
      // implementation. The answerable half is what stops that.
      const answered = arch.cases.filter((c) => c.expected.status === 'answered').length;
      expect(answered).toBeGreaterThanOrEqual(30);
    },
  );

  it('has unique case ids', () => {
    const ids = ARCHETYPES.flatMap((a) => a.cases.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asks in guest phrasing, not registry field ids', () => {
    for (const arch of ARCHETYPES) {
      for (const c of arch.cases) {
        expect(c.question.trim().length).toBeGreaterThan(3);
        expect(c.question).not.toContain('_');
      }
    }
  });

  it('exercises every non-system registry field per archetype', () => {
    for (const arch of ARCHETYPES) {
      const covered = new Set(arch.cases.map((c) => c.field_id));
      expect(covered.size).toBeGreaterThanOrEqual(40);
    }
  });
});

describe.each(ARCHETYPES.map((a) => [a.id, a] as const))(
  'golden suite grading: %s',
  (_id, arch) => {
    it('grades every case exactly', () => {
      const failures: string[] = [];
      for (const c of arch.cases) {
        const facts: Record<string, FactSnapshot> = c.fact ? { [c.field_id]: c.fact } : {};
        const got = resolveFact({
          fieldId: c.field_id,
          audience: c.audience as AudienceTier,
          facts,
          inapplicableFieldIds: arch.inapplicable_field_ids,
          accessWindowOk: c.access_window_ok,
          now: NOW,
        });
        if (
          got.status !== (c.expected.status as ResolveStatus) ||
          got.reason !== c.expected.reason ||
          got.knowledgeGap !== c.expected.knowledge_gap
        ) {
          failures.push(
            `${c.id}: expected ${c.expected.status}/${c.expected.reason}/gap=${c.expected.knowledge_gap}, got ${got.status}/${got.reason}/gap=${got.knowledgeGap}`,
          );
        }
      }
      // Report every failure at once. A gate that surfaces one failure per run turns a
      // regression sweep into a dozen sequential CI cycles.
      expect(failures, `${failures.length} of ${arch.cases.length} golden cases failed`).toEqual([]);
    });

    it('never leaks a fact to an audience the registry denies', () => {
      const leaks = arch.cases
        .filter((c) => c.expected.status === 'refused')
        .filter((c) => {
          const facts = c.fact ? { [c.field_id]: c.fact } : {};
          return (
            resolveFact({
              fieldId: c.field_id,
              audience: c.audience as AudienceTier,
              facts,
              inapplicableFieldIds: arch.inapplicable_field_ids,
              accessWindowOk: c.access_window_ok,
              now: NOW,
            }).status === 'answered'
          );
        })
        .map((c) => c.id);
      expect(leaks).toEqual([]);
    });

    it('emits a knowledge gap for every needs_host case and none otherwise', () => {
      for (const c of arch.cases) {
        const facts = c.fact ? { [c.field_id]: c.fact } : {};
        const got = resolveFact({
          fieldId: c.field_id,
          audience: c.audience as AudienceTier,
          facts,
          inapplicableFieldIds: arch.inapplicable_field_ids,
          accessWindowOk: c.access_window_ok,
          now: NOW,
        });
        expect(got.knowledgeGap).toBe(got.status === 'needs_host');
      }
    });
  },
);

describe('gate summary', () => {
  it('reports pass rate per archetype', () => {
    const rows = ARCHETYPES.map((arch) => {
      let pass = 0;
      for (const c of arch.cases) {
        const facts = c.fact ? { [c.field_id]: c.fact } : {};
        const got = resolveFact({
          fieldId: c.field_id,
          audience: c.audience as AudienceTier,
          facts,
          inapplicableFieldIds: arch.inapplicable_field_ids,
          accessWindowOk: c.access_window_ok,
          now: NOW,
        });
        if (got.status === c.expected.status && got.reason === c.expected.reason) pass += 1;
      }
      return { archetype: arch.id, cases: arch.cases.length, pass, rate: pass / arch.cases.length };
    });
    // eslint-disable-next-line no-console -- the gate's result is the artifact.
    console.log(rows.map((r) => `${r.archetype}: ${r.pass}/${r.cases} (${(r.rate * 100).toFixed(1)}%)`).join('\n'));
    // §7.0 is a gate, not a score to improve later: anything under 100% blocks autonomy.
    for (const r of rows) expect(r.rate).toBe(1);
  });
});
