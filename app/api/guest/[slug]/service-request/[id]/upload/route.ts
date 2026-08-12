import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestServiceRequestUploadSchema } from '@/lib/validation';
import { createPresignedPutUrl, hasS3 } from '@/lib/storage/s3';
import { checkRateLimit } from '@/lib/rate-limit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WS-7 — guest photo/short-video upload for an in-progress service request.
// This is the guest-facing counterpart to the host-only presign route at
// app/api/properties/[id]/storage/presign/route.ts (whose comment flagged this
// as the intended follow-up). Bytes never transit the app server.

function extFromContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'video/mp4': return 'mp4';
    case 'video/quicktime': return 'mov';
    default: return 'bin';
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  if (!hasS3()) return NextResponse.json({ error: 'Uploads are not available right now.' }, { status: 503 });

  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = guestServiceRequestUploadSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  const { contentType, contentLengthBytes } = parsed.data;

  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties').select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: ticket } = await admin
    .from('service_requests')
    .select('id, interview_status')
    .eq('id', (await params).id)
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });

  const rate = await checkRateLimit(admin, {
    key: session.sessionId,
    limit: 20,
    windowSeconds: 3600,
    action: 'guest.service_request.upload',
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many uploads. Please try again in a bit.' }, { status: 429 });
  }

  // Key prefix always scoped to property/stay — never trust a caller-supplied path.
  const ext = extFromContentType(contentType);
  const key = `service-requests/${session.propertyId}/${session.stayId}/${(await params).id}/${crypto.randomUUID()}.${ext}`;

  try {
    const presigned = await createPresignedPutUrl({ key, contentType, contentLengthBytes });
    log.info('guest_service_request_upload_presigned', { serviceRequestId: (await params).id });
    return NextResponse.json(presigned);
  } catch (e) {
    log.warn('guest_service_request_upload_presign_failed', { serviceRequestId: (await params).id, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not create an upload URL.' }, { status: 500 });
  }
}
