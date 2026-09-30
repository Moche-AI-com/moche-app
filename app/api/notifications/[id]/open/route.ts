import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { acknowledgeNotification } from '@/lib/notifications/deliveries';
import { safeDashboardPath } from '@/lib/notifications/delivery-status';

// #195 PR 3: tracked open link. Requires a signed-in session, so link
// previews and unfurlers (no cookie) never count as the host opening it.
// Only the notification's own recipient can acknowledge it.

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

function redirectTo(path: string, req: Request) {
  const res = NextResponse.redirect(new URL(path, req.url), 303);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireSession();
  if (!idSchema.safeParse(id).success) return redirectTo('/dashboard', req);
  const result = await acknowledgeNotification(createAdminClient(), { notificationId: id, profileId: ctx.profile.id });
  return redirectTo(safeDashboardPath(result?.link ?? null), req);
}
