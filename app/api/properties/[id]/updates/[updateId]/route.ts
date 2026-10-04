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
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in again to review this suggestion.' }, { status: 401 });

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

  const status = statusForDecision(decision);

  // The old review UI edits `text`; learned proposals store `answer`. Support
  // that payload without silently approving the original answer instead. Model,
  // rationale and message references remain server-owned provenance on modify.
  let candidate = decision === 'modify' ? parsed.data.value : row.proposed_value;
  if (field.kind === 'guest_answer' && decision === 'modify'
    && candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const edited = candidate as Record<string, unknown>;
    const original = row.proposed_value && typeof row.proposed_value === 'object' && !Array.isArray(row.proposed_value)
      ? row.proposed_value as Record<string, unknown> : {};
    candidate = {
      ...original,
      ...edited,
      ...(Object.prototype.hasOwnProperty.call(edited, 'text') ? { answer: edited.text } : {}),
      model: original.model, rationale: original.rationale, sourceMessageIds: original.sourceMessageIds,
    };
  }
  const normalized = decision === 'deny' ? null : normalizeProposedValue(field, candidate);
  if (normalized && !normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });
  const approvedValue = normalized?.ok ? normalized.value : null;

  // Compare-and-set before side effects: simultaneous decisions cannot both
  // create a Brain item. This records the human decision, not successful apply.
  // Only known pre-write failures return to pending. Partial writes retain the
  // decision so a retry cannot create duplicates; applied_at means completed.
  const { data: claimed, error: claimError } = await admin.from('proposed_updates')
    .update({
      status, reviewed_by: user.id, resolution_note: note ?? null,
      ...(decision !== 'deny' ? { applied_value: approvedValue as never } : {}),
    })
    .eq('id', row.id).eq('property_id', (await params).id).eq('status', 'pending')
    .select('id').maybeSingle();
  if (claimError) return NextResponse.json({ error: 'Could not save that decision.' }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: 'This suggestion has already been reviewed.' }, { status: 409 });

  // ---- deny: record the decision, write nothing anywhere else ----------------
  if (decision === 'deny') {
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

  // ---- approve / modify: apply the reviewed value, then record completion ---
  const applied = await applyProposal(admin, {
    propertyId: (await params).id,
    fieldPath: row.field_path,
    value: approvedValue,
    actorProfileId: user.id,
    sourceRef: row.source_ref,
  });

  if (!applied.ok) {
    await admin.from('proposed_updates').update({
      ...(applied.partial ? {} : {
        status: 'pending' as const, reviewed_by: null, reviewed_at: null,
        resolution_note: null, applied_value: null,
      }),
      apply_error: applied.error,
    }).eq('id', row.id).eq('property_id', (await params).id).eq('status', status).is('applied_at', null);
    await audit(createClient(), {
      action: 'brain.proposal.apply_failed', actorProfileId: user.id,
      hostAccountId: access.property.host_account_id, propertyId: (await params).id,
      targetType: 'proposed_update', targetId: row.id,
      metadata: { fieldPath: row.field_path, partial: Boolean(applied.partial), targetId: applied.targetId ?? null },
    });
    return NextResponse.json({ error: applied.error, partial: Boolean(applied.partial) }, { status: 502 });
  }

  const { error } = await admin
    .from('proposed_updates')
    .update({
      status,
      reviewed_by: user?.id ?? null,
      resolution_note: note ?? null,
      applied_value: approvedValue as never,
      applied_at: new Date().toISOString(),
      apply_error: null,
    })
    .eq('id', row.id).eq('property_id', (await params).id).eq('status', status);

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
      metadata: { fieldPath: row.field_path },
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
