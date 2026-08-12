import { NextResponse } from 'next/server';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPresignedGetUrl, hasS3 } from '@/lib/storage/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns fresh 5-min presigned GET URLs for a ticket's stored media keys. media_urls
// holds raw S3 keys (not URLs, which would expire) — this route re-signs them on demand
// so the host dashboard never renders a stale/expired link.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; ticketId: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  if (!access.can.resolveMaintenance) {
    return NextResponse.json({ error: 'You do not have permission to view this.' }, { status: 403 });
  }
  if (!hasS3()) return NextResponse.json({ urls: [] });

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from('service_requests')
    .select('media_urls')
    .eq('id', (await params).ticketId)
    .eq('property_id', (await params).id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Service request not found.' }, { status: 404 });

  const keys = Array.isArray(ticket.media_urls) ? (ticket.media_urls as unknown[]).filter((k): k is string => typeof k === 'string') : [];
  const urls = await Promise.all(
    keys.map(async (key) => ({ key, url: await createPresignedGetUrl(key) })),
  );
  return NextResponse.json({ urls });
}
