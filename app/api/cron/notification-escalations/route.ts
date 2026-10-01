import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCronAuthorized } from '@/lib/cron/auth';
import { log } from '@/lib/log';
import { runDueEscalations } from '@/lib/notifications/escalation-runner';

// #195 PR 4: runs due reminder / backup steps. Called every minute by the
// Trigger.dev clock in trigger/notification-escalations.ts (Vercel Hobby
// crons cannot run per-minute). The shared-secret check is the first
// statement and fails closed when CRON_SECRET is unset; unauthorized callers
// get a 404.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return new NextResponse(null, { status: 404 });
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
