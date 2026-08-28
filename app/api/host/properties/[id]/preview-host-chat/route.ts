import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host-preview host chat. Accepts the host's "guest" message and echoes it back
// in the exact shape the portal thread renders. Nothing is written, translated,
// or notified — the host is testing the flow, not messaging themselves. There is
// deliberately no DB client in this file: there is nothing to persist.

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
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
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });

  return NextResponse.json({
    ok: true,
    message: {
      id: `preview-${crypto.randomUUID()}`,
      role: 'guest',
      content: parsed.data.message,
      createdAt: new Date().toISOString(),
      messageKind: 'text',
      replyToMessageId: null,
      escalationId: null,
    },
  });
}
