// Local llama.cpp-compatible cross-encoder reranker sidecar (directive §7.1, §7.0a).
//
// Hard constraints from the directive, encoded here rather than left to convention:
//   * Never an Ollama chat/completion endpoint dressed up as a reranker, and never
//     LLM-as-reranker. This client speaks only to a /rerank endpoint that returns
//     index+score pairs. If the configured base URL is empty, reranking is off.
//   * The sidecar's response is untrusted input. Duplicated, missing, foreign, or
//     unauthorized ids are rejected outright — we never "repair" a bad response by
//     dropping the offending entries, because a partially-honoured ordering is
//     indistinguishable from a working reranker in a test.
//   * Failing closed means falling back to pre-rerank RRF order. That is only
//     acceptable offline. On a guest-facing path the caller must treat a failure as
//     a route-policy signal (see rerankOutcome.degraded) and must not let it make
//     insufficient evidence look sufficient.

import { serverEnv } from '@/lib/env';

export const RERANK_TIMEOUT_MS = 2_000;

export class RerankerContractError extends Error {
  readonly code:
    | 'duplicate_id'
    | 'missing_id'
    | 'foreign_id'
    | 'count_mismatch'
    | 'malformed';
  constructor(code: RerankerContractError['code'], message: string) {
    super(message);
    this.name = 'RerankerContractError';
    this.code = code;
  }
}

export interface RerankRequest {
  query: string;
  /** Fused candidate ids in pre-rerank (RRF) order. Sent verbatim, order preserved. */
  candidateIds: readonly string[];
  /** Candidate text, index-aligned with candidateIds. */
  documents: readonly string[];
}

export interface RerankOutcome {
  /** Ids in final context order. On failure this is the pre-rerank order. */
  order: string[];
  /** True when the sidecar did not produce a usable ordering. */
  degraded: boolean;
  /** Why it degraded, for AiDecision audit data. Null when the rerank succeeded. */
  reason: string | null;
  /**
   * Score gap between the top two reranked candidates. Feeds server-computed
   * confidence (§7.3). Null when degraded — a fallback has no margin, and reporting
   * zero would be read as "very close call" rather than "no signal".
   */
  margin: number | null;
}

export function rerankerEnabled(): boolean {
  return Boolean(serverEnv.rerankerBaseUrl);
}

/** Validates a sidecar response against the exact candidate set we sent. */
export function validateRerankResponse(
  candidateIds: readonly string[],
  results: unknown,
): { index: number; score: number }[] {
  if (!Array.isArray(results)) {
    throw new RerankerContractError('malformed', 'results is not an array');
  }
  const parsed = results.map((r) => {
    const row = r as { index?: unknown; score?: unknown };
    if (typeof row?.index !== 'number' || !Number.isInteger(row.index)) {
      throw new RerankerContractError('malformed', 'result index is not an integer');
    }
    if (typeof row?.score !== 'number' || !Number.isFinite(row.score)) {
      throw new RerankerContractError('malformed', 'result score is not a finite number');
    }
    return { index: row.index, score: row.score };
  });

  if (parsed.length !== candidateIds.length) {
    throw new RerankerContractError(
      'count_mismatch',
      `expected ${candidateIds.length} results, got ${parsed.length}`,
    );
  }

  const seen = new Set<number>();
  for (const { index } of parsed) {
    if (index < 0 || index >= candidateIds.length) {
      // An index outside the sent range is the sidecar referring to a document we
      // never supplied — a foreign/unauthorized candidate.
      throw new RerankerContractError('foreign_id', `result index ${index} out of range`);
    }
    if (seen.has(index)) {
      throw new RerankerContractError('duplicate_id', `duplicate result index ${index}`);
    }
    seen.add(index);
  }
  for (let i = 0; i < candidateIds.length; i += 1) {
    if (!seen.has(i)) {
      throw new RerankerContractError('missing_id', `result missing candidate index ${i}`);
    }
  }
  return parsed;
}

type Fetcher = typeof fetch;

/**
 * Reranks candidates. Never throws: a contract violation or transport failure returns
 * a degraded outcome carrying the pre-rerank order plus a reason for the audit record.
 */
export async function rerank(
  req: RerankRequest,
  opts: { fetchImpl?: Fetcher; baseUrl?: string; timeoutMs?: number } = {},
): Promise<RerankOutcome> {
  const preRerank = [...req.candidateIds];
  const baseUrl = opts.baseUrl ?? serverEnv.rerankerBaseUrl;
  if (!baseUrl) {
    return { order: preRerank, degraded: true, reason: 'reranker_disabled', margin: null };
  }
  if (preRerank.length !== req.documents.length) {
    return { order: preRerank, degraded: true, reason: 'candidate_document_mismatch', margin: null };
  }
  if (preRerank.length < 2) {
    // Nothing to reorder. Not a degradation — there is simply no work.
    return { order: preRerank, degraded: false, reason: null, margin: null };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? RERANK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/rerank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: serverEnv.rerankerModel,
        query: req.query,
        documents: req.documents,
        top_n: preRerank.length,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { order: preRerank, degraded: true, reason: `reranker_http_${res.status}`, margin: null };
    }
    const body = (await res.json()) as { results?: unknown };
    const parsed = validateRerankResponse(preRerank, body?.results);
    const ranked = [...parsed].sort((a, b) => b.score - a.score);
    const margin = ranked.length >= 2 ? ranked[0].score - ranked[1].score : null;
    return {
      order: ranked.map((r) => preRerank[r.index]),
      degraded: false,
      reason: null,
      margin,
    };
  } catch (err) {
    const reason =
      err instanceof RerankerContractError
        ? `reranker_contract_${err.code}`
        : (err as Error)?.name === 'AbortError'
          ? 'reranker_timeout'
          : 'reranker_unavailable';
    return { order: preRerank, degraded: true, reason, margin: null };
  } finally {
    clearTimeout(timer);
  }
}
