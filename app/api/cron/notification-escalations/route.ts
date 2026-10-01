import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { runDueEscalations } from '@/lib/notifications/escalation-runner';

// #195 PR 4: runs due reminder / backup steps. Called every minute by the
// Trigger.dev schedule in trigger/notification-escalations.ts (Vercel Hobby
// crons cannot run per-minute). Same contract as the other /api/cron routes:
// the shared-secret check is the first statement and fails closed when
// CRON_SECRET is unset; unauthorized callers get a 404.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(req.headers.get('authorization') ?? '');
  return received.length === expected.length && timingSafeEqual(expected, received);
}

async function handle(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return new NextResponse(null, { status: 404 });
  try {
    const summary = await runDueEscalations(createAdminClient());
    log.info('notification_escalations_run', summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch {
    log.error('notification_escalations_run_failed', {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
