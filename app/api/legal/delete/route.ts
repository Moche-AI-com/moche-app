import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { requestDeletion, confirmDeletion } from '@/lib/legal/data-rights';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GDPR Art. 17 erasure. Two-step to prevent accidental destruction:
//   step 'request' — non-destructive; marks intent + returns what will be
//                    erased vs. retained (billing/legal/audit are retained).
//   step 'confirm' — destructive; requires an explicit acknowledgement and the
//                    service-role admin client. Anonymizes the profile and
//                    removes guest/property personal data. See the
//                    `data-deletion-request` runbook.
const bodySchema = z.object({
  step: z.enum(['request', 'confirm']),
  // Confirm must echo this exact phrase so a stray POST can't erase an account.
  confirmation: z.string().optional(),
});

const CONFIRM_PHRASE = 'DELETE MY DATA';

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    /* fall through to schema error */
  }
  const parsed = bodySchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (parsed.data.step === 'request') {
    const summary = await requestDeletion(createClient(), {
      userId: ctx.user.id,
      hostAccountId: ctx.account.id,
    });
    return NextResponse.json({ step: 'request', summary });
  }

  // step === 'confirm'
  if (parsed.data.confirmation !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `To confirm, send confirmation: "${CONFIRM_PHRASE}".` },
      { status: 400 },
    );
  }
  if (!hasServiceRole()) {
    log.error('data_deletion_no_service_role', { hostAccountId: ctx.account.id });
    return NextResponse.json(
      { error: 'Deletion is temporarily unavailable. Please contact support.' },
      { status: 503 },
    );
  }

  const result = await confirmDeletion(createAdminClient(), {
    userId: ctx.user.id,
    hostAccountId: ctx.account.id,
  });
  log.info('data_deletion_confirmed', {
    hostAccountId: ctx.account.id,
    ok: result.ok,
    errorCount: result.errors.length,
  });
  return NextResponse.json({ step: 'confirm', ...result });
}
