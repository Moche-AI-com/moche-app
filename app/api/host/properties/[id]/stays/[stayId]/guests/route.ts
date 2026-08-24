import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { generateVisitCode, hashContact, hashVisitCode, verifyVisitCode } from '@/lib/crypto';
import { DEFAULT_GRACE_PERIOD_HOURS } from '@/lib/constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  displayName: z.string().trim().max(160).optional().default(''),
  phone: z.string().trim().min(7).max(40).optional(),
  code: z.string().regex(/^\d{4}$/).optional(),
});

function guestRow(row: any, includeCode = false, code = '') {
  return {
    id: row.id,
    stayId: row.stay_id,
    displayName: row.display_name,
    guestLabel: row.guest_label,
    phoneLast4: row.phone_last4,
    registered: Boolean(row.guest_identity_id),
    notificationConsent: row.notification_consent === true,
    pinExpiresAt: row.pin_expires_at,
    revoked: Boolean(row.pin_revoked_at),
    ...(includeCode ? { code } : {}),
  };
}

async function graceHours(admin: ReturnType<typeof createAdminClient>, propertyId: string) {
  const { data } = await admin
    .from('property_settings')
    .select('grace_period_hours')
    .eq('property_id', propertyId)
    .maybeSingle();
  const value = (data as { grace_period_hours?: number } | null)?.grace_period_hours;
  return typeof value === 'number' && value >= 0 && value <= 168 ? value : DEFAULT_GRACE_PERIOD_HOURS;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; stayId: string }> }) {
  const { id, stayId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to manage guest IDs.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from('stay_guests')
    .select('id, stay_id, display_name, guest_label, phone_last4, guest_identity_id, notification_consent, pin_expires_at, pin_revoked_at, pin_secret_ref, created_at')
    .eq('property_id', id)
    .eq('stay_id', stayId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: 'Could not load guest IDs.' }, { status: 500 });

  // Ticket 2B: decrypt each guest's PIN for display. Rows minted before the Vault
  // envelope have no pin_secret_ref and render without a code. portal_code_read is
  // service_role-only; this route has already authorized the host above.
  const guests: any[] = [];
  for (const row of data ?? []) {
    let code: string | undefined;
    const ref = row.pin_secret_ref as string | null;
    if (ref && ref.startsWith('vault:')) {
      const { data: decrypted } = await (admin as any).rpc('portal_code_read', { p_secret_id: ref.slice('vault:'.length) });
      if (typeof decrypted === 'string' && decrypted) code = decrypted;
    }
    guests.push(guestRow(row, Boolean(code), code ?? ''));
  }
  return NextResponse.json({ guests });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; stayId: string }> }) {
  const { id, stayId } = await params;
  const access = await requirePropertyAccess(id);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to manage guest IDs.' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid guest and optional 4-digit code.' }, { status: 400 });

  const admin = createAdminClient();
  const db = admin as any;
  const { data: stay } = await db
    .from('stays')
    .select('id, check_out, status')
    .eq('id', stayId)
    .eq('property_id', id)
    .maybeSingle();
  if (!stay) return NextResponse.json({ error: 'Stay not found.' }, { status: 404 });

  const { data: existing } = await db
    .from('stay_guests')
    .select('id, pin_hash')
    .eq('property_id', id)
    .eq('stay_id', stayId)
    .is('pin_revoked_at', null);

  let code = parsed.data.code ?? '';
  if (code && (existing ?? []).some((guest: any) => verifyVisitCode(code, guest.id, guest.pin_hash))) {
    return NextResponse.json({ error: 'That code is already assigned to another guest on this stay.' }, { status: 409 });
  }

  if (!code) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = generateVisitCode();
      if (!(existing ?? []).some((guest: any) => verifyVisitCode(candidate, guest.id, guest.pin_hash))) {
        code = candidate;
        break;
      }
    }
  }
  if (!code) return NextResponse.json({ error: 'Could not allocate a unique guest code.' }, { status: 500 });

  const guestId = crypto.randomUUID();

  // Ticket 2B: vault the PIN so the host can re-view it on the guest row. The hash
  // stays the verification path; a Vault failure degrades to hash-only (shown once).
  let pinSecretRef: string | null = null;
  try {
    const { data: secretId, error: vaultError } = await (admin as any).rpc('portal_code_store', {
      p_secret: code,
      p_name: `stay-guest:${guestId}`,
    });
    if (!vaultError && secretId) pinSecretRef = `vault:${secretId}`;
  } catch {
    pinSecretRef = null;
  }

  const expiresAt = new Date(new Date(stay.check_out).getTime() + (await graceHours(admin, id)) * 60 * 60 * 1000).toISOString();
  const phone = parsed.data.phone?.trim() ?? '';
  const { data: created, error } = await db
    .from('stay_guests')
    .insert({
      id: guestId,
      property_id: id,
      stay_id: stayId,
      guest_label: `Guest ${(existing?.length ?? 0) + 1}`,
      display_name: parsed.data.displayName || null,
      phone_hash: phone ? hashContact(phone) : null,
      phone_last4: phone ? phone.replace(/\D/g, '').slice(-4) : null,
      pin_hash: hashVisitCode(code, guestId),
      pin_stay_hash: hashVisitCode(code, stayId),
      pin_expires_at: expiresAt,
      ...(pinSecretRef ? { pin_secret_ref: pinSecretRef } : {}),
    })
    .select('id, stay_id, display_name, guest_label, phone_last4, guest_identity_id, notification_consent, pin_expires_at, pin_revoked_at')
    .single();

  if (error) return NextResponse.json({ error: 'Could not create the guest ID.' }, { status: 500 });
  return NextResponse.json({ ok: true, guest: guestRow(created, true, code) });
}
