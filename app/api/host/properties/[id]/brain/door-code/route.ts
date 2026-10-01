import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser, requirePropertyAccess } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/rate-limit';
import { setSecretValue } from '@/lib/brain/values';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELD_ID = 'door_code_or_entry_method';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
const GENERIC = 'Could not complete that right now. Please try again.';
const saveSchema = z.object({ code: z.string().trim().min(1).max(64) });

// Host-only door/access code the host chose to keep in Moche-AI.
//
// The code never reaches a guest surface or a model: the registry tier is
// host_only, guest entry-code questions escalate to the host, and the database
// read function refuses every caller except service_role and every field that
// is not a host_only Vault secret.
//
// POST = reveal, PUT = save/replace. Both: owner or Brain editor only, rate
// limited per user+property, Cache-Control no-store. Reveal writes its audit
// row BEFORE the read and fails closed. The code is never logged or echoed in
// an error.

async function authorize(id: string) {
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.editBrain) {
    return { denied: NextResponse.json({ error: 'Only the owner or a Brain editor can manage the door code.' }, { status: 403, headers: NO_STORE }) };
  }
  const user = await getUser();
  if (!user) return { denied: NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE }) };
  return { access, user };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ('denied' in auth) return auth.denied;
  const { access, user } = auth;
  const admin = createAdminClient();
  const db = admin as any;

  const rate = await checkRateLimit(admin, { key: `${user.id}:${id}`, limit: 10, windowSeconds: 3600, action: 'rl.door_code_reveal' });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many reveals. Try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.retryAfterSeconds) } });
  }

  const { error: auditError } = await db.from('audit_logs').insert({
    host_account_id: access.property.host_account_id,
    property_id: id,
    actor_profile_id: user.id,
    actor_type: 'host',
    action: 'brain.door_code_revealed',
    target_type: 'brain_value',
    target_id: FIELD_ID,
    metadata: { via: 'dashboard' },
  });
  if (auditError) return NextResponse.json({ error: GENERIC }, { status: 503, headers: NO_STORE });

  const { data, error } = await db.rpc('brain_values_read_host_secret', { p_property_id: id, p_field_id: FIELD_ID });
  if (error) return NextResponse.json({ error: GENERIC }, { status: 503, headers: NO_STORE });
  const code = typeof data === 'string' && data.length > 0 ? data : null;
  return NextResponse.json({ code }, { headers: NO_STORE });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ('denied' in auth) return auth.denied;
  const { access, user } = auth;

  let payload: unknown;
  try { payload = await req.json(); } catch {
    return NextResponse.json({ error: 'Enter a code.' }, { status: 400, headers: NO_STORE });
  }
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a code (up to 64 characters).' }, { status: 400, headers: NO_STORE });

  const admin = createAdminClient();
  const rate = await checkRateLimit(admin, { key: `${user.id}:${id}`, limit: 20, windowSeconds: 3600, action: 'rl.door_code_save' });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many changes. Try again later.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(rate.retryAfterSeconds) } });
  }

  try {
    await setSecretValue(admin, { propertyId: id, fieldId: FIELD_ID, plaintext: parsed.data.code, actorProfileId: user.id });
  } catch {
    return NextResponse.json({ error: GENERIC }, { status: 503, headers: NO_STORE });
  }

  await (admin as any).from('audit_logs').insert({
    host_account_id: access.property.host_account_id,
    property_id: id,
    actor_profile_id: user.id,
    actor_type: 'host',
    action: 'brain.door_code_saved',
    target_type: 'brain_value',
    target_id: FIELD_ID,
    metadata: { via: 'dashboard', length: parsed.data.code.length },
  });
  revalidatePath(`/dashboard/properties/${id}/brain`);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
