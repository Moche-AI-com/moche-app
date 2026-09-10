import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
}).strict();

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) }).strict();

// Guest web-push subscription (issue #133, item 5). The subscription binds to
// THIS guest session (stay + property), never to a person — a shared-device
// unsubscribe can only remove this session's own endpoints.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 });
  const admin = createAdminClient();

  // Slug must match the session's property (defense in depth, same as chat).
  const { data: property } = await admin
    .from('properties').select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const rl = await checkRateLimit(admin, {
    key: `push_sub:${session.sessionId}`,
    action: 'guest.push_subscribe',
    limit: 10,
    windowSeconds: 60 * 60,
  });
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });

  const { endpoint, keys } = parsed.data;
  const { error } = await (admin as any).from('guest_push_subscriptions').upsert({
    property_id: session.propertyId,
    stay_id: session.stayId,
    guest_session_id: session.sessionId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) return NextResponse.json({ error: 'Could not save the subscription.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const admin = createAdminClient();
  await (admin as any).from('guest_push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('guest_session_id', session.sessionId)
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId);
  return NextResponse.json({ ok: true });
}
