// Directive §7.0a — reranker ordering-divergence fixture.
//
// The fixture is built so RRF is WRONG: a plausible-but-irrelevant candidate ("pool
// towels are in the hall closet" for a Wi-Fi question) wins both retrievers on surface
// overlap, while the genuinely relevant candidate ranks lower. If reranking were a
// pass-through of RRF order, every assertion about divergence below would fail.

import { describe, it, expect, vi } from 'vitest';
import { fuseRRF, RRF_K } from './rrf';
import { validateRerankResponse, RerankerContractError, rerank } from './reranker';
import { planContext } from './context';

const CANDIDATES = [
  { id: 'node-towels', text: 'Pool towels are in the hall closet next to the router.' },
  { id: 'node-parking', text: 'Guest parking is in space 4B behind the building.' },
  { id: 'node-wifi', text: 'The guest network name is Cove-Guest. Ask the host for the password.' },
  { id: 'node-checkout', text: 'Checkout is at 11:00 AM.' },
];

// Both retrievers rank the decoy first; the real answer is third.
const FUSION = {
  dense: ['node-towels', 'node-parking', 'node-wifi', 'node-checkout'],
  lexical: ['node-towels', 'node-checkout', 'node-wifi', 'node-parking'],
};

const QUERY = 'what is the wifi network here';

/** A sidecar that actually understands the query: wifi first, decoy last. */
function goodSidecar(ids: readonly string[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      results: ids.map((id, index) => ({
        index,
        score: id === 'node-wifi' ? 0.94 : id === 'node-checkout' ? 0.31 : id === 'node-parking' ? 0.12 : 0.05,
      })),
    }),
  })) as unknown as typeof fetch;
}

describe('RRF fusion', () => {
  it('uses k=60 as the fusion constant, not candidate depth', () => {
    expect(RRF_K).toBe(60);
    const [top] = fuseRRF({ dense: ['a'], lexical: ['a'] });
    expect(top.score).toBeCloseTo(2 / (60 + 1), 12);
  });

  it('ranks the plausible-but-wrong candidate first in the fixture', () => {
    const order = fuseRRF(FUSION).map((f) => f.id);
    expect(order[0]).toBe('node-towels');
    expect(order.indexOf('node-wifi')).toBeGreaterThan(0);
  });

  it('is deterministic across runs so cache keys and evals reproduce', () => {
    const a = fuseRRF(FUSION).map((f) => f.id);
    const b = fuseRRF(FUSION).map((f) => f.id);
    expect(a).toEqual(b);
  });

  it('respects per-retriever candidate depth independently of k', () => {
    const ids = Array.from({ length: 50 }, (_, i) => `n${i}`);
    expect(fuseRRF({ dense: ids, lexical: ids, depth: 20 })).toHaveLength(20);
  });
});

describe('sidecar receives the exact fused candidate ids', () => {
  it('sends every fused id, in pre-rerank order, and nothing else', async () => {
    const fusedIds = fuseRRF(FUSION).map((f) => f.id);
    const seen: { candidateIds: readonly string[] }[] = [];
    const spy = async (req: { query: string; candidateIds: readonly string[]; documents: readonly string[] }) => {
      seen.push({ candidateIds: req.candidateIds });
      return { order: [...req.candidateIds], degraded: false, reason: null, margin: 0.1 };
    };

    await planContext(QUERY, CANDIDATES, FUSION, { rerankImpl: spy as unknown as typeof rerank });

    expect(seen).toHaveLength(1);
    expect(seen[0].candidateIds).toEqual(fusedIds);
  });

  it('sends documents index-aligned with the ids', async () => {
    let captured: { candidateIds: readonly string[]; documents: readonly string[] } | null = null;
    const spy = async (req: { query: string; candidateIds: readonly string[]; documents: readonly string[] }) => {
      captured = req;
      return { order: [...req.candidateIds], degraded: false, reason: null, margin: null };
    };
    await planContext(QUERY, CANDIDATES, FUSION, { rerankImpl: spy as unknown as typeof rerank });
    const byId = new Map(CANDIDATES.map((c) => [c.id, c.text]));
    captured!.candidateIds.forEach((id, i) => {
      expect(captured!.documents[i]).toBe(byId.get(id));
    });
  });
});

describe('reranked ordering diverges from RRF and drives context', () => {
  it('returns an order different from the pre-rerank order', async () => {
    const fusedIds = fuseRRF(FUSION).map((f) => f.id);
    const outcome = await rerank(
      { query: QUERY, candidateIds: fusedIds, documents: fusedIds.map((id) => CANDIDATES.find((c) => c.id === id)!.text) },
      { baseUrl: 'http://sidecar.test', fetchImpl: goodSidecar(fusedIds) },
    );
    expect(outcome.degraded).toBe(false);
    expect(outcome.order).not.toEqual(fusedIds);
    expect(outcome.order[0]).toBe('node-wifi');
  });

  it('builds context in reranker order, not RRF order', async () => {
    const fusedIds = fuseRRF(FUSION).map((f) => f.id);
    const plan = await planContext(QUERY, CANDIDATES, FUSION, {
      limit: 3,
      rerankImpl: ((req: { candidateIds: readonly string[]; documents: readonly string[] }) =>
        rerank({ query: QUERY, ...req }, { baseUrl: 'http://sidecar.test', fetchImpl: goodSidecar(req.candidateIds) })) as unknown as typeof rerank,
    });
    expect(plan.fusedIds[0]).toBe('node-towels');
    expect(plan.contextIds[0]).toBe('node-wifi');
    expect(plan.contextIds).toHaveLength(3);
  });

  it('can promote a candidate RRF ranked below the truncation cut', async () => {
    // Six candidates, cut at 3. The real answer is RRF-ranked 5th, so truncating
    // before reranking would drop it entirely.
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, text: `doc ${i}` }));
    const ids = many.map((c) => c.id);
    const plan = await planContext('q', many, { dense: ids, lexical: ids }, {
      limit: 3,
      rerankImpl: (async (req: { candidateIds: readonly string[] }) => ({
        order: [...req.candidateIds].reverse(),
        degraded: false,
        reason: null,
        margin: 0.4,
      })) as unknown as typeof rerank,
    });
    expect(plan.contextIds).toEqual(['c5', 'c4', 'c3']);
  });

  it('reports the top-two score margin for server-computed confidence', async () => {
    const ids = ['a', 'b', 'c'];
    const outcome = await rerank(
      { query: 'q', candidateIds: ids, documents: ids },
      {
        baseUrl: 'http://sidecar.test',
        fetchImpl: (async () => ({
          ok: true,
          json: async () => ({ results: [{ index: 0, score: 0.2 }, { index: 1, score: 0.9 }, { index: 2, score: 0.1 }] }),
        })) as unknown as typeof fetch,
      },
    );
    expect(outcome.order).toEqual(['b', 'a', 'c']);
    expect(outcome.margin).toBeCloseTo(0.7, 6);
  });
});

describe('malformed sidecar responses are rejected outright', () => {
  const ids = ['a', 'b', 'c'];

  it('rejects a duplicated id', () => {
    expect(() =>
      validateRerankResponse(ids, [{ index: 0, score: 1 }, { index: 0, score: 0.5 }, { index: 1, score: 0.2 }]),
    ).toThrow(RerankerContractError);
  });

  it('rejects a missing id', () => {
    try {
      validateRerankResponse(ids, [{ index: 0, score: 1 }, { index: 1, score: 0.5 }]);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as RerankerContractError).code).toBe('count_mismatch');
    }
  });

  it('rejects a foreign/unauthorized id outside the sent range', () => {
    try {
      validateRerankResponse(ids, [{ index: 0, score: 1 }, { index: 1, score: 0.5 }, { index: 9, score: 0.2 }]);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as RerankerContractError).code).toBe('foreign_id');
    }
  });

  it('rejects a non-integer index and a non-finite score', () => {
    expect(() => validateRerankResponse(ids, [{ index: 0.5, score: 1 }])).toThrow(RerankerContractError);
    expect(() => validateRerankResponse(ids, [{ index: 0, score: NaN }])).toThrow(RerankerContractError);
  });

  it('rejects a non-array payload', () => {
    expect(() => validateRerankResponse(ids, { results: 'nope' })).toThrow(RerankerContractError);
  });

  it('does not partially honour a bad ordering — it falls back whole', async () => {
    const fusedIds = fuseRRF(FUSION).map((f) => f.id);
    const outcome = await rerank(
      { query: QUERY, candidateIds: fusedIds, documents: fusedIds },
      {
        baseUrl: 'http://sidecar.test',
        fetchImpl: (async () => ({
          ok: true,
          json: async () => ({ results: fusedIds.map((_, i) => ({ index: i === 3 ? 0 : i, score: 1 - i / 10 })) }),
        })) as unknown as typeof fetch,
      },
    );
    expect(outcome.degraded).toBe(true);
    expect(outcome.reason).toBe('reranker_contract_duplicate_id');
    expect(outcome.order).toEqual(fusedIds);
  });
});

describe('fails closed to pre-rerank order and flags the degradation', () => {
  const ids = ['a', 'b', 'c'];

  it('marks disabled reranking as degraded rather than silently succeeding', async () => {
    const outcome = await rerank({ query: 'q', candidateIds: ids, documents: ids }, { baseUrl: '' });
    expect(outcome).toEqual({ order: ids, degraded: true, reason: 'reranker_disabled', margin: null });
  });

  it('reports an HTTP failure without throwing', async () => {
    const outcome = await rerank(
      { query: 'q', candidateIds: ids, documents: ids },
      { baseUrl: 'http://sidecar.test', fetchImpl: (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch },
    );
    expect(outcome.degraded).toBe(true);
    expect(outcome.reason).toBe('reranker_http_503');
    expect(outcome.order).toEqual(ids);
  });

  it('reports a transport failure without throwing', async () => {
    const outcome = await rerank(
      { query: 'q', candidateIds: ids, documents: ids },
      { baseUrl: 'http://sidecar.test', fetchImpl: (async () => { throw new Error('econnrefused'); }) as unknown as typeof fetch },
    );
    expect(outcome.degraded).toBe(true);
    expect(outcome.reason).toBe('reranker_unavailable');
  });

  it('never reports a margin when degraded, so confidence cannot read a fallback as a close call', async () => {
    const outcome = await rerank({ query: 'q', candidateIds: ids, documents: ids }, { baseUrl: '' });
    expect(outcome.margin).toBeNull();
  });
});
