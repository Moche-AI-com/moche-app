/*
 * Legacy credential scan / cleanup (2026-10-01, door codes are host-only).
 *
 * Finds door codes, lock combinations, alarm codes and Wi-Fi passwords that were
 * typed into free-text surfaces before the host-only / location-only policy:
 *   brain_items (title + body), document_chunks (content),
 *   answer_cache (answer), messages (role = 'assistant' only).
 * Host-authored Host Chat messages are NOT touched: a host may legitimately send
 * their own guest a code directly.
 *
 * Detection is lib/brain/redact.ts, the same rules the concierge uses on every
 * prompt and answer, so the scan and the runtime guard can never disagree.
 *
 * Output never contains a credential: only table, row id, property id, and the
 * redaction rule labels that fired.
 *
 * Usage (service role; run locally or in CI, never from the browser):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/scan-legacy-credentials.ts
 *   ... npx tsx scripts/scan-legacy-credentials.ts --apply
 *
 * --apply:
 *   brain_items     body/title rewritten with the value redacted (prose kept)
 *   document_chunks content rewritten redacted, embedding cleared (re-embed on next ingest)
 *   answer_cache    row deleted (regenerates on demand from clean sources)
 *   messages        assistant content rewritten redacted, guest_replay_safe = false
 * Every applied change writes an audit_logs row (action 'brain.legacy_credential_redacted').
 */
import { createClient } from '@supabase/supabase-js';
import { redactCredentials } from '../lib/brain/redact';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const db = createClient(url, key, { auth: { persistSession: false } }) as any;
const PAGE = 500;

type Finding = { table: string; id: string; propertyId: string | null; labels: string[] };
const findings: Finding[] = [];

async function* pages(table: string, columns: string, filter?: (q: any) => any) {
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.code ?? error.message}`);
    if (!data || data.length === 0) return;
    yield data as any[];
    if (data.length < PAGE) return;
  }
}

async function audit(table: string, id: string, propertyId: string | null, labels: string[]) {
  await db.from('audit_logs').insert({
    property_id: propertyId,
    actor_type: 'system',
    action: 'brain.legacy_credential_redacted',
    target_type: table,
    target_id: id,
    metadata: { labels },
  });
}

function scan(text: string | null | undefined) {
  return redactCredentials(text ?? '');
}

async function brainItems() {
  for await (const rows of pages('brain_items', 'id, property_id, title, body', (q) => q.is('deleted_at', null))) {
    for (const r of rows) {
      const t = scan(r.title);
      const b = scan(r.body);
      const labels = [...new Set([...t.redactions, ...b.redactions])];
      if (!labels.length) continue;
      findings.push({ table: 'brain_items', id: r.id, propertyId: r.property_id, labels });
      if (apply) {
        const { error } = await db.from('brain_items').update({ title: t.text, body: b.text }).eq('id', r.id);
        if (error) throw new Error(`brain_items update ${r.id}: ${error.code}`);
        await audit('brain_items', r.id, r.property_id, labels);
      }
    }
  }
}

async function documentChunks() {
  for await (const rows of pages('document_chunks', 'id, property_id, content')) {
    for (const r of rows) {
      const c = scan(r.content);
      if (!c.redactions.length) continue;
      findings.push({ table: 'document_chunks', id: r.id, propertyId: r.property_id, labels: c.redactions });
      if (apply) {
        const { error } = await db.from('document_chunks').update({ content: c.text, embedding: null }).eq('id', r.id);
        if (error) throw new Error(`document_chunks update ${r.id}: ${error.code}`);
        await audit('document_chunks', r.id, r.property_id, c.redactions);
      }
    }
  }
}

async function answerCache() {
  for await (const rows of pages('answer_cache', 'id, property_id, answer')) {
    for (const r of rows) {
      const a = scan(r.answer);
      if (!a.redactions.length) continue;
      findings.push({ table: 'answer_cache', id: r.id, propertyId: r.property_id, labels: a.redactions });
      if (apply) {
        const { error } = await db.from('answer_cache').delete().eq('id', r.id);
        if (error) throw new Error(`answer_cache delete ${r.id}: ${error.code}`);
        await audit('answer_cache', r.id, r.property_id, a.redactions);
      }
    }
  }
}

async function assistantMessages() {
  for await (const rows of pages('messages', 'id, property_id, content', (q) => q.eq('role', 'assistant'))) {
    for (const r of rows) {
      const m = scan(r.content);
      if (!m.redactions.length) continue;
      findings.push({ table: 'messages', id: r.id, propertyId: r.property_id, labels: m.redactions });
      if (apply) {
        const { error } = await db.from('messages').update({ content: m.text, guest_replay_safe: false }).eq('id', r.id);
        if (error) throw new Error(`messages update ${r.id}: ${error.code}`);
        await audit('messages', r.id, r.property_id, m.redactions);
      }
    }
  }
}

async function main() {
  await brainItems();
  await documentChunks();
  await answerCache();
  await assistantMessages();

  const byTable = findings.reduce<Record<string, number>>((acc, f) => { acc[f.table] = (acc[f.table] ?? 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', total: findings.length, byTable, findings }, null, 2));
  if (!apply && findings.length) console.log('\nRe-run with --apply to redact. Values are never printed.');
}

main().catch((err) => {
  console.error(`scan failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  process.exit(1);
});
