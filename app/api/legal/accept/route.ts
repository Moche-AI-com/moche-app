import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { recordAcceptances } from '@/lib/legal/acceptance';
import { CLICKWRAP_SLUGS, type LegalSlug } from '@/lib/legal/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  // Optional subset; defaults to the full clickwrap set. Only known slugs allowed.
  slugs: z.array(z.enum(CLICKWRAP_SLUGS as [LegalSlug, ...LegalSlug[]])).optional(),
  context: z.enum(['reacceptance', 'dpa']).default('reacceptance'),
});

// Records a (re)acceptance for the signed-in user. Backs the re-acceptance modal
// shown when a host's previously accepted document version is behind the current one.
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body is fine — defaults apply */
  }
  const parsed = bodySchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const h = await headers();
  await recordAcceptances(createClient(), {
    userId: ctx.user.id,
    hostAccountId: ctx.account.id,
    slugs: parsed.data.slugs,
    context: parsed.data.context,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  });

  return NextResponse.json({ ok: true });
}
