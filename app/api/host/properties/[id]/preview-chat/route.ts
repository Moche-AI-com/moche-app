import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPropertyAccess } from '@/lib/auth/guards';
import { answerGuestQuestion } from '@/lib/guest/concierge';
import type { ChatMessage } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Host-only "chat as a guest" preview. The host is already authenticated and must
// have access to the property (getPropertyAccess enforces ownership/co-host). This
// path reuses the exact guest concierge logic but is strictly read-only:
//   - no guest_access_sessions / stays / conversations / messages are created
//   - no escalations are raised, no host notifications sent
//   - retrieval is scoped in the DB to this property's guest-visible chunks only
// so a host previews precisely what a verified guest would see.
const previewSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await getPropertyAccess(params.id);
  if (!access) return NextResponse.json({ error: 'Not authorized for this property.' }, { status: 403 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = previewSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: 'Enter a message.' }, { status: 400 });

  const admin = createAdminClient();
  const history: ChatMessage[] = (parsed.data.history ?? []).map((m) => ({ role: m.role, content: m.content }));

  // Use the host's confidence threshold so escalation behaviour matches production.
  const { data: settings } = await admin
    .from('property_settings')
    .select('confidence_threshold')
    .eq('property_id', params.id)
    .maybeSingle();

  const answer = await answerGuestQuestion(admin, {
    propertyId: params.id,
    propertyName: access.property.display_name,
    question: parsed.data.message,
    history,
    confidenceThreshold: settings?.confidence_threshold ?? undefined,
    source: 'host_preview',
  });

  return NextResponse.json({
    ok: true,
    answer: answer.text,
    confidence: Number(answer.confidence.toFixed(2)),
    escalated: answer.shouldEscalate,
    isEmergency: answer.isEmergency,
  });
}
