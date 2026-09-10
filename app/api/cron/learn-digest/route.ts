import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicEnv, serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { UPDATES_SENDER } from '@/lib/mail/senders';
import { summarizeValue } from '@/lib/brain/proposals';

// Weekly Brain-learning digest (issue #133, item 6). Scheduled in vercel.json.
//
// One email per account per week instead of a ping per proposal — 15 separate
// nudges train hosts to rubber-stamp or ignore the queue, which is the exact
// failure mode the human-in-the-loop gate exists to prevent. Each item carries
// its source escalation link (provenance) and a one-tap review link; decisions
// still land through the dashboard's existing authenticated decision route, so
// the email carries no bearer tokens and no writable power.
//
// Same contract as the freshness digest: the shared-secret check is the only
// thing standing between an anonymous caller and a service-role read, so it is
// the first statement in the handler and fails closed when unset. Best-effort:
// a send failure is logged and the run continues.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_ACCOUNTS = 100;
const MAX_ITEMS_PER_DIGEST = 20;

type PendingRow = {
  id: string;
  property_id: string;
  host_account_id: string;
  label: string | null;
  field_path: string;
  proposed_value: unknown;
  source_ref: string | null;
  source_type: string | null;
  confidence: number | null;
  created_at: string;
};

function authorized(req: Request): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${secret}`;
}

function renderDigest(input: {
  items: PendingRow[];
  propertyNames: Map<string, string>;
  appUrl: string;
}): { subject: string; text: string } {
  const lines: string[] = [];
  const count = input.items.length;
  const noun = count === 1 ? 'suggestion' : 'suggestions';
  lines.push(`Your property Brain learned ${count} ${noun} this week — review them before guests see the answers.`);
  lines.push('');
  for (const item of input.items) {
    const property = input.propertyNames.get(item.property_id) ?? 'Your property';
    lines.push(`• ${item.label ?? summarizeValue(item.proposed_value, 80)}`);
    lines.push(`  ${property} — ${summarizeValue(item.proposed_value, 140)}`);
    if (item.source_ref) {
      lines.push(`  From an answered escalation: ${input.appUrl}/dashboard/escalations/${item.source_ref}`);
    }
    lines.push(`  Review: ${input.appUrl}/dashboard/updates?property=${item.property_id}`);
    lines.push('');
  }
  lines.push('Approve, correct, or dismiss each one in the Knowledge Queue — nothing reaches guests until a person approves it.');
  return {
    subject: `Moche-AI: ${count} Brain ${noun} waiting for your review`,
    text: lines.join('\n'),
  };
}

async function sendDigest(to: string, subject: string, text: string): Promise<boolean> {
  if (!serverEnv.resendApiKey) {
    log.warn('learn_digest_no_resend_key', {});
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.resendApiKey);
    const { data, error } = await resend.emails.send({
      from: UPDATES_SENDER.from,
      replyTo: UPDATES_SENDER.replyTo,
      to,
      subject,
      text,
    });
    if (error || !data?.id) {
      log.error('learn_digest_send_failed', {});
      return false;
    }
    return true;
  } catch {
    log.error('learn_digest_send_error', {});
    return false;
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!authorized(req)) {
    return new NextResponse(null, { status: 404 });
  }

  const admin = createAdminClient();
  const appUrl = publicEnv.appUrl.replace(/\/$/, '');

  const { data: rows, error } = await admin
    .from('proposed_updates')
    .select('id, property_id, host_account_id, label, field_path, proposed_value, source_ref, source_type, confidence, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1000);
  if (error) {
    log.error('learn_digest_query_failed', {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (!rows || rows.length === 0) return NextResponse.json({ ok: true, considered: 0, sent: 0 });

  const byAccount = new Map<string, PendingRow[]>();
  for (const row of rows as PendingRow[]) {
    const list = byAccount.get(row.host_account_id) ?? [];
    if (list.length < MAX_ITEMS_PER_DIGEST) list.push(row);
    byAccount.set(row.host_account_id, list);
  }
  const accountIds = [...byAccount.keys()].slice(0, MAX_ACCOUNTS);
  if (accountIds.length === 0) return NextResponse.json({ ok: true, considered: 0, sent: 0 });

  const { data: accounts } = await admin
    .from('host_accounts')
    .select('id, owner_id, profiles:owner_id(email)')
    .in('id', accountIds);
  const emailByAccount = new Map<string, string>();
  for (const account of accounts ?? []) {
    const email = (account as { profiles?: { email?: string } | null }).profiles?.email;
    if (email) emailByAccount.set((account as { id: string }).id, email);
  }

  const { data: properties } = await admin
    .from('properties')
    .select('id, display_name')
    .in('id', [...new Set(rows.map((r) => (r as PendingRow).property_id))]);
  const propertyNames = new Map<string, string>(
    (properties ?? []).map((p) => [(p as { id: string }).id, (p as { display_name: string }).display_name]),
  );

  let sent = 0;
  let skipped = 0;
  for (const [accountId, items] of byAccount) {
    const email = emailByAccount.get(accountId);
    if (!email) { skipped += 1; continue; }
    const digest = renderDigest({ items, propertyNames, appUrl });
    if (await sendDigest(email, digest.subject, digest.text)) sent += 1;
  }

  log.info('learn_digest_run', { accounts: accountIds.length, items: rows.length, sent, skipped });
  return NextResponse.json({ ok: true, accounts: accountIds.length, sent, skipped });
}
