import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host preview of an extras request. The offer lookup is real (the request must
// reference a live offer on this property, exactly like the guest route), but no
// extras_orders row, order event, notification, or analytics event is ever
// created. The PRV- reference makes the preview unmistakable on screen.

const bodySchema = z.object({
  offerId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(20).optional(),
  variant: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
  preferredFor: z.string().max(60).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const access = await getPropertyAccess(id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: offer } = await admin
    .from('guest_extras')
    .select('id')
    .eq('id', parsed.data.offerId)
    .eq('property_id', id)
    .eq('active', true)
    .maybeSingle();
  if (!offer) return NextResponse.json({ error: 'That offer is no longer available.' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    requestNumber: `PRV-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`,
  });
}
