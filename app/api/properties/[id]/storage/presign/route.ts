import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { createPresignedPutUrl, hasS3 } from '@/lib/storage/s3';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Foundation route for PR #3 (S3 direct-upload). Real callers (WS-7 guest photo
// upload, HQ audit exports, generated assets) land in later PRs; this proves the
// presign contract end to end for host-side use today.

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — image/document-sized objects only.
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const BodySchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  contentLengthBytes: z.number().int().positive().max(MAX_BYTES),
  fileName: z.string().min(1).max(200).optional(),
});

function extFromContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasS3()) return NextResponse.json({ error: 'Storage is not configured.' }, { status: 503 });

  const access = await getPropertyAccess((await params).id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!access.can.editProperty) return NextResponse.json({ error: 'You cannot upload to this property.' }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 });
  const { contentType, contentLengthBytes } = parsed.data;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json({ error: 'Unsupported content type.' }, { status: 400 });
  }

  const ctx = await getSessionContext();
  const admin = createAdminClient();
  const rate = await checkRateLimit(admin, {
    key: ctx?.user.id ?? (await params).id,
    limit: 30,
    windowSeconds: 60,
    action: 'storage.presign',
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many upload requests. Try again shortly.' }, { status: 429 });
  }

  // Key prefix is always scoped to the property id — never trust a caller-supplied path.
  const ext = extFromContentType(contentType);
  const key = `properties/${(await params).id}/${crypto.randomUUID()}.${ext}`;

  try {
    const presigned = await createPresignedPutUrl({ key, contentType, contentLengthBytes });
    await audit(admin, {
      action: 'storage.presign.put',
      actorProfileId: ctx?.user.id,
      hostAccountId: access.property.host_account_id,
      propertyId: (await params).id,
      targetType: 's3_object',
      targetId: key,
    });
    return NextResponse.json(presigned);
  } catch (e) {
    log.warn('storage_presign_failed', { propertyId: (await params).id, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not create an upload URL.' }, { status: 500 });
  }
}
