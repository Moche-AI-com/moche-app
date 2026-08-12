import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPropertyAccess, getUser } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { audit } from '@/lib/audit';
import {
  isProposalDecision,
  statusForDecision,
  canDecide,
  proposableField,
  normalizeProposedValue,
} from '@/lib/brain/proposals';
import { applyProposal } from '@/lib/brain/apply-proposal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  decision: z.string().refine(isProposalDecision, 'Pick approve, modify, or deny.'),
  /** Required for 'modify': the host's corrected value. */
  value: z.unknown().optional(),
  note: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string; updateId: string }> }) {
  const access = await getPropertyAccess((await params).id);
  if (!access) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  // Same permission the database enforces via can_edit_property.
  if (!access.can.editBrain) {
    return NextResponse.json({ error: 'You cannot review suggestions for this property.' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input.' }, { status: 400 });
  }
  const { decision, note } = parsed.data;
  if (!isProposalDecision(decision)) {
    return NextResponse.json({ error: 'Pick approve, modify, or deny.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Scope the read by property_id as well as id so an id from another property
  // cannot be decided through a property the caller happens to have rights on.
  const { data: row } = await admin
    .from('proposed_updates')
    .select('id, property_id, field_path, status, proposed_value, source_ref')
    .eq('id', (await params).updateId)
    .eq('property_id', (await params).id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  if (!canDecide(row.status)) {
    return NextResponse.json(
      { error: 'This suggestion has already been reviewed.' },
      { status: 409 },
    );
  }

  const field = proposableField(row.field_path);
  if (!field) {
    return NextResponse.json(
      { error: 'This suggestion targets something this version cannot update.' },
      { status: 422 },
    );
  }

  const user = await getUser();
  const status = statusForDecision(decision);

  // ---- deny: record the decision, write nothing anywhere else ----------------
  if (decision === 'deny') {
    const { error } = await admin
      .from('proposed_updates')
      .update({ status, reviewed_by: user?.id ?? null, resolution_note: note ?? null })
      .eq('id', row.id);
    if (error) return NextResponse.json({ error: 'Could not save that decision.' }, { status: 500 });

    await audit(createClient(), {
      action: 'brain.proposal.deny',
      actorProfileId: user?.id,
      hostAccountId: access.property.host_account_id,
      propertyId: (await params).id,
      targetType: 'proposed_update',
      targetId: row.id,
      metadata: { fieldPath: row.field_path },
    });
    return NextResponse.json({ ok: true, status });
  }

  // ---- approve / modify: validate, apply, then record -----------------------
  const candidate = decision === 'modify' ? parsed.data.value : row.proposed_value;
  const normalized = normalizeProposedValue(field, candidate);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });

  const applied = await applyProposal(admin, {
    propertyId: (await params).id,
    fieldPath: row.field_path,
    value: normalized.value,
    actorProfileId: user?.id ?? null,
    sourceRef: row.source_ref,
  });

  if (!applied.ok) {
    // The decision is NOT recorded when the write fails. Leaving the row pending
    // means the host sees it again and can retry, rather than the queue claiming
    // "approved" for something that never landed.
    return NextResponse.json({ error: applied.error }, { status: 502 });
  }

  const { error } = await admin
    .from('proposed_updates')
    .update({
      status,
      reviewed_by: user?.id ?? null,
      resolution_note: note ?? null,
      applied_value: normalized.value as never,
      applied_at: new Date().toISOString(),
      apply_error: null,
    })
    .eq('id', row.id);

  if (error) {
    // The value is already live. Surfacing a 500 here would invite a retry that
    // applies it twice, so report success and log the bookkeeping gap instead.
    await audit(createClient(), {
      action: 'brain.proposal.record_failed',
      actorProfileId: user?.id,
      hostAccountId: access.property.host_account_id,
      propertyId: (await params).id,
      targetType: 'proposed_update',
      targetId: row.id,
      metadata: { fieldPath: row.field_path, error: error.message },
    });
  }

  await audit(createClient(), {
    action: decision === 'approve' ? 'brain.proposal.approve' : 'brain.proposal.modify',
    actorProfileId: user?.id,
    hostAccountId: access.property.host_account_id,
    propertyId: (await params).id,
    targetType: 'proposed_update',
    targetId: row.id,
    metadata: { fieldPath: row.field_path, targetType: applied.targetType, targetId: applied.targetId },
  });

  return NextResponse.json({ ok: true, status, applied: applied.targetType });
}
