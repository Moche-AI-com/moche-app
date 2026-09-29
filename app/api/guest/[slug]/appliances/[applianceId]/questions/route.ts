import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { approvedApplianceAnswers } from '@/lib/appliances/guidance';
import { resolveLanguage } from '@/lib/guest/languages';
import { localizeCardCopy, type CopyBundle } from '@/lib/guest/card-copy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnswerRow = { id: string; property_id: string; appliance_id: string; question: string; answer: string; status: string; approved_at: string | null; model_number_snapshot: string | null };

// Only approved, guest-visible questions for the verified guest's property may be translated.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; applianceId: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });
  const { slug, applianceId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applianceId)) {
    return NextResponse.json({ error: 'Invalid appliance.' }, { status: 400 });
  }
  const requested = new URL(req.url).searchParams.get('language');
  const language = resolveLanguage(requested);
  if (requested && requested !== 'auto' && !language) {
    return NextResponse.json({ error: 'Unsupported language.' }, { status: 400 });
  }
  const admin = createAdminClient() as any;
  const { data: property, error: propertyError } = await admin.from('properties')
    .select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (propertyError || !property || property.slug !== slug) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }
  const { data: appliance, error: applianceError } = await admin.from('property_appliances')
    .select('id, property_id, model_number, guest_visible').eq('id', applianceId)
    .eq('property_id', session.propertyId).eq('guest_visible', true).maybeSingle();
  if (applianceError || !appliance) return NextResponse.json({ error: 'Appliance not found.' }, { status: 404 });
  const { data: answers, error: answersError } = await admin.from('appliance_answers')
    .select('id, property_id, appliance_id, question, answer, status, approved_at, model_number_snapshot')
    .eq('property_id', session.propertyId).eq('appliance_id', applianceId).eq('status', 'approved')
    .order('approved_at', { ascending: true }).limit(101);
  if (answersError || !answers || answers.length > 100) {
    return NextResponse.json({ error: 'Appliance questions unavailable.' }, { status: 503 });
  }
  const questions = approvedApplianceAnswers({
    id: appliance.id, propertyId: session.propertyId, modelNumber: appliance.model_number, guestVisible: appliance.guest_visible,
  }, (answers as AnswerRow[]).map((answer) => ({
    id: answer.id, propertyId: answer.property_id, applianceId: answer.appliance_id,
    question: answer.question, answer: answer.answer, status: answer.status,
    approvedAt: answer.approved_at, modelNumberSnapshot: answer.model_number_snapshot,
  }))).map((answer) => ({ id: answer.id, text: answer.question }));
  if (!language || language.code === 'en' || questions.length === 0) {
    return NextResponse.json({ questions }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  try {
    const chunks = [];
    for (let i = 0; i < questions.length; i += 8) chunks.push(questions.slice(i, i + 8));
    const translated: { id: string; text: string }[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const wave = await Promise.all(chunks.slice(i, i + 3).map(async (chunk) => {
        const source: CopyBundle = { cards: [{ key: `${session.propertyId}:${applianceId}`, title: 'Appliance questions',
          description: 'Approved questions for this appliance.', prompt: 'How do I use this appliance?',
          prompts: chunk.map((item) => item.text) }], menu: {} };
        const copy = await localizeCardCopy(source, language.code);
        return chunk.map((item, index) => ({ id: item.id, text: copy.cards[0].prompts[index] }));
      }));
      for (const batch of wave) translated.push(...batch);
    }
    return NextResponse.json({ questions: translated }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Translated questions unavailable.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
