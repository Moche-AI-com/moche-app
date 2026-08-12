import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPropertyAccess, getSessionContext } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyProposal } from '@/lib/brain/apply-proposal';
import { createProposal } from '@/lib/brain/proposal-store';
import { KNOWLEDGE_REQUIREMENTS, computeReadiness } from '@/lib/brain/readiness';

const BLOCKING_KEYS = new Set(['arrival_instructions', 'emergency_contact', 'house_rules', 'essential_amenities', 'property_basics']);
const postSchema = z.object({ requirementKey: z.string().max(80), answer: z.string().trim().min(20).max(4000) }).strict();

async function jobForReviewer(jobId: string) {
  const client = createClient();
  const { data: job } = await client.from('property_import_jobs').select('id, property_id, host_account_id').eq('id', jobId).maybeSingle();
  if (!job?.property_id) return null;
  const access = await getPropertyAccess(job.property_id);
  return access?.can.editBrain && access.property.host_account_id === job.host_account_id ? { job, access, client } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!await getSessionContext()) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  const context = await jobForReviewer((await params).jobId);
  if (!context) return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  const { data: statuses } = await context.client.from('property_knowledge_requirement_status').select('requirement_key, status').eq('property_id', context.job.property_id!);
  const readiness = computeReadiness({ statuses: (statuses ?? []).map((row) => ({ requirementKey: row.requirement_key, status: row.status })) });
  return NextResponse.json({ gaps: readiness.missing.filter((item) => BLOCKING_KEYS.has(item.requirementKey)) });
}

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const ctx = await getSessionContext(); if (!ctx) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const parsed = postSchema.safeParse(body); if (!parsed.success || !BLOCKING_KEYS.has(parsed.data.requirementKey)) return NextResponse.json({ error: 'Invalid gap answer.' }, { status: 400 });
  const context = await jobForReviewer((await params).jobId); if (!context) return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  const requirement = KNOWLEDGE_REQUIREMENTS.find((item) => item.key === parsed.data.requirementKey); if (!requirement) return NextResponse.json({ error: 'Unknown requirement.' }, { status: 400 });
  const category = requirement.key === 'arrival_instructions' ? 'checkin_checkout' : requirement.key === 'emergency_contact' ? 'emergency' : requirement.key === 'house_rules' ? 'house_rules' : 'core';
  const admin = createAdminClient();
  const proposal = await createProposal(admin, { propertyId: context.job.property_id!, hostAccountId: context.job.host_account_id, fieldPath: 'brain.listing_summary', label: requirement.label, proposedValue: { title: requirement.label, text: parsed.data.answer, category, visibility: 'guest' }, sourceType: 'text_paste', sourceRef: null, confidence: null });
  if (!proposal.ok) return NextResponse.json({ error: proposal.error }, { status: 422 });
  const applied = await applyProposal(admin, { propertyId: context.job.property_id!, fieldPath: 'brain.listing_summary', value: { title: requirement.label, text: parsed.data.answer, category, visibility: 'guest' }, actorProfileId: ctx.user.id });
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 422 });
  const now = new Date().toISOString();
  await admin.from('proposed_updates').update({ status: 'approved', reviewed_at: now, reviewed_by: ctx.user.id, applied_at: now, applied_value: parsed.data.answer }).eq('id', proposal.id);
  const { error } = await admin.from('property_knowledge_requirement_status').upsert({ property_id: context.job.property_id!, requirement_key: requirement.key, requirement_version: 1, status: 'satisfied', satisfied_at: now, evidence: { source: 'gap_interview', proposal_id: proposal.id }, updated_at: now }, { onConflict: 'property_id,requirement_key' });
  if (error) return NextResponse.json({ error: 'Answer was saved but readiness could not be updated.' }, { status: 422 });
  return NextResponse.json({ ok: true });
}
