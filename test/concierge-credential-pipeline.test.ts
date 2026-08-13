import { describe, expect, it } from 'vitest';
import { redactCredentials, redactBlocks } from '@/lib/brain/redact';
import { redactPII, redactMessages } from '@/lib/ai/redaction';

/**
 * End-to-end guard over the FULL credential path a guest answer travels:
 *
 *   document_chunks / knowledge_nodes
 *     -> redactBlocks()            (lib/brain/redact.ts, retrieval boundary)
 *     -> system prompt
 *     -> redactMessages()          (lib/ai/redaction.ts, external-router boundary)
 *     -> model
 *     -> redactCredentials()       (output pass, before cache write + response)
 *
 * The production incident proved that testing each stage in isolation is not
 * enough: both modules "passed their own tests" while the SECOND stage reversed
 * the work of the first, mangling the prose and stranding an intact credential
 * next to a `[redacted]` marker. That composite string then entered `answer_cache`
 * and `messages`, so every later turn re-ingested the leak as context.
 *
 * These fixtures are the literal strings observed in production for the
 * "Cape house" property. Every stage, and every composition of stages, must be
 * credential-free.
 */

// The stale host_qa chunk, exactly as stored.
const CHUNK_HOST_QA = "What's the WiFi password?\n\nThe WiFi network is CapeHouse-Guest and the password is Dennis2026!";
// The updated core chunk, exactly as stored (curly quotes included).
const CHUNK_CORE = 'Network and Wifi Information\n\nWifi Information: \nNetwork Name: \u201cHomeAdd\u201d\nWifi Password: \u201cCapehouse40!\u201d';
// The structured knowledge node (already redacted at ingest).
const NODE_WIFI = 'WiFi network: HomeAdd\nWiFi password: [redacted]';
// What the broken pipeline actually emitted and cached.
const LEAKED_ANSWER = 'The WiFi: [redacted] network name is CapeHouse-Guest and the password: [redacted] is Dennis2026!';

const SECRETS = ['Dennis2026', 'Capehouse40'];

function expectNoSecret(text: string, label: string) {
  for (const secret of SECRETS) {
    expect(text, `${label} leaked "${secret}"`).not.toContain(secret);
  }
}

describe('concierge credential pipeline — stage by stage', () => {
  it('stage 1: retrieval redaction strips passwords from both chunks', () => {
    const { blocks } = redactBlocks([CHUNK_HOST_QA, CHUNK_CORE, NODE_WIFI]);
    blocks.forEach((b, i) => expectNoSecret(b, `block ${i}`));
  });

  it('stage 1: retrieval redaction preserves the non-secret network names', () => {
    const { blocks } = redactBlocks([CHUNK_HOST_QA, CHUNK_CORE]);
    expect(blocks[0]).toContain('CapeHouse-Guest');
    expect(blocks[1]).toContain('HomeAdd');
  });

  it('stage 2: the external-router pass does not undo stage 1', () => {
    // This is the exact regression. The old SECRET_LABEL_RE re-matched the already
    // redacted text, consumed the wrong token, and reintroduced a mangled sentence.
    const { blocks } = redactBlocks([CHUNK_HOST_QA, CHUNK_CORE]);
    for (const b of blocks) {
      const out = redactPII(b);
      expectNoSecret(out, 'post-router');
      expect(out).not.toMatch(/wi-?fi:\s*\[redacted\]\s*(network|name)/i);
    }
  });

  it('stage 2: a raw chunk that somehow skipped stage 1 is still contained', () => {
    // Defense in depth: the router pass must be safe on its own.
    expectNoSecret(redactPII(CHUNK_HOST_QA), 'router-only host_qa');
    expectNoSecret(redactPII(CHUNK_CORE), 'router-only core');
  });

  it('stage 3: the output pass cleans a leak arriving via history', () => {
    expectNoSecret(redactCredentials(LEAKED_ANSWER).text, 'output pass');
  });

  it('stage 3: reports that it fired, so the answer is never cached', () => {
    // concierge.ts keys its cache-write skip on this being non-empty.
    expect(redactCredentials(LEAKED_ANSWER).redactions.length).toBeGreaterThan(0);
  });

  it('full composition is credential-free and order-independent', () => {
    const { blocks } = redactBlocks([CHUNK_HOST_QA, CHUNK_CORE, NODE_WIFI, LEAKED_ANSWER]);
    const routed = blocks.map((b) => redactPII(b));
    const final = routed.map((b) => redactCredentials(b).text);
    final.forEach((t, i) => expectNoSecret(t, `composed ${i}`));

    // Reverse order too — no stage may depend on another running first.
    const reversed = [CHUNK_HOST_QA, CHUNK_CORE, LEAKED_ANSWER]
      .map((t) => redactPII(t))
      .map((t) => redactCredentials(t).text);
    reversed.forEach((t, i) => expectNoSecret(t, `reversed ${i}`));
  });

  it('poisoned conversation history is sanitized before it reaches the model', () => {
    const history = [
      { role: 'user', content: 'What is the WiFi network name and password?' },
      { role: 'assistant', content: LEAKED_ANSWER },
      { role: 'user', content: 'Is early check-in possible?' },
    ];
    for (const m of redactMessages(history)) expectNoSecret(m.content, `history ${m.role}`);
  });

  it('every pass is idempotent, so repeated turns cannot degrade the text', () => {
    for (const fixture of [CHUNK_HOST_QA, CHUNK_CORE, NODE_WIFI, LEAKED_ANSWER]) {
      const once = redactCredentials(redactPII(fixture)).text;
      const twice = redactCredentials(redactPII(once)).text;
      expect(twice).toBe(once);
    }
  });

  it('does not destroy the answers the concierge is supposed to give', () => {
    // Non-credential connectivity and prose answers must survive intact.
    const keep = [
      'The router is in the hall closet.',
      'The door code is on the arrival card.',
      'The WiFi network name is CapeHouse-Guest.',
      'Check-out is 11am; late check-out is $25.',
    ];
    for (const s of keep) {
      const out = redactCredentials(redactPII(s)).text;
      expect(out).not.toContain('[redacted]');
      expect(out).not.toContain('stored securely');
    }
  });
});
