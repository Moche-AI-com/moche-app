import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, getPropertyAccess } from '@/lib/auth/guards';
import { runSafetyTriage, runInterviewTurn, type InterviewEntry } from '@/lib/guest/service-request-interview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host preview of the maintenance interview. Runs the REAL engine
// (runSafetyTriage + runInterviewTurn) against a transcript the client holds, so
// no service_requests row is ever created, no host notification fires, and no
// rate-limit/analytics rows accrue. The response contract mirrors the guest
// route (status + question/choices/report) plus a clearly-marked PRV- reference,
// so the portal's completion screen renders exactly as a guest would see it.

const entrySchema = z.object({
  role: z.enum(['guest', 'assistant']),
  text: z.string().max(2000),
  choices: z.array(z.string().max(200)).max(6).nullish(),
});

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  transcript: z.array(entrySchema).max(40).optional(),
});

function previewReference() {
  return `PRV-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

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
  if (!parsed.success) return NextResponse.json({ error: 'Describe the issue first.' }, { status: 400 });

  const { message } = parsed.data;
  const transcript = (parsed.data.transcript ?? []) as InterviewEntry[];

  // Deterministic safety triage first, exactly like the guest route — a safety
  // trigger must look identical in preview so the host can verify the UX.
  const safety = runSafetyTriage(message);
  if (safety) {
    return NextResponse.json({
      status: 'safety_escalated',
      guestMessage: safety.guestMessage,
      reference: previewReference(),
    });
  }

  const turn = await runInterviewTurn(message, transcript);
  if (turn.type === 'final') {
    return NextResponse.json({ status: 'completed', report: turn.report, reference: previewReference() });
  }

  return NextResponse.json({ status: 'in_progress', question: turn.question, choices: turn.choices ?? null });
}
