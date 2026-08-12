import { NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { listPropertySessions } from '@/lib/guest/sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission.' }, { status: 403 });
  }
  const sessions = await listPropertySessions((await params).id, true);
  return NextResponse.json({ sessions });
}
