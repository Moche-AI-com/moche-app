// Reciprocal Rank Fusion for hybrid retrieval (directive §7.1).
//
// Two things the directive is explicit about and that are easy to get wrong:
//   * k = 60 is the RANK-FUSION constant, not candidate depth. Candidate depth is
//     chosen per retriever (initially 20-50 by corpus size) and passed in separately.
//   * fusion operates on ranks, never on raw scores. Dense cosine similarity and
//     lexical ts_rank are not on a comparable scale; averaging them produces a number
//     that looks meaningful and is not.

export const RRF_K = 60;

/** Candidate depth per retriever. Depth, unlike k, is a tuning knob. */
export const DEFAULT_CANDIDATE_DEPTH = 30;

export interface FusionInput {
  /** Dense (HNSW/embedding) candidate ids, best first. */
  dense: readonly string[];
  /** Lexical (GIN/tsvector) candidate ids, best first. */
  lexical: readonly string[];
  /** Truncate each list before fusing. Defaults to DEFAULT_CANDIDATE_DEPTH. */
  depth?: number;
}

export interface FusedCandidate {
  id: string;
  score: number;
  denseRank: number | null;
  lexicalRank: number | null;
}

/**
 * Fuses two ranked id lists into one.
 *
 * Ties are broken by the better of the two input ranks, then lexicographically by id.
 * A deterministic order matters more than which tiebreak is "right": the answer cache
 * key includes the node ordering, so a nondeterministic fusion would silently produce
 * cache misses and non-reproducible evals.
 */
export function fuseRRF(input: FusionInput): FusedCandidate[] {
  const depth = input.depth ?? DEFAULT_CANDIDATE_DEPTH;
  const dense = input.dense.slice(0, depth);
  const lexical = input.lexical.slice(0, depth);

  const denseRank = new Map<string, number>();
  dense.forEach((id, i) => {
    if (!denseRank.has(id)) denseRank.set(id, i + 1);
  });
  const lexicalRank = new Map<string, number>();
  lexical.forEach((id, i) => {
    if (!lexicalRank.has(id)) lexicalRank.set(id, i + 1);
  });

  const ids = new Set<string>([...denseRank.keys(), ...lexicalRank.keys()]);
  const out: FusedCandidate[] = [];
  for (const id of ids) {
    const d = denseRank.get(id) ?? null;
    const l = lexicalRank.get(id) ?? null;
    let score = 0;
    if (d !== null) score += 1 / (RRF_K + d);
    if (l !== null) score += 1 / (RRF_K + l);
    out.push({ id, score, denseRank: d, lexicalRank: l });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ba = Math.min(a.denseRank ?? Infinity, a.lexicalRank ?? Infinity);
    const bb = Math.min(b.denseRank ?? Infinity, b.lexicalRank ?? Infinity);
    if (ba !== bb) return ba - bb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return out;
}
