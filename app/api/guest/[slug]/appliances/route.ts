import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { approvedApplianceAnswers } from '@/lib/appliances/guidance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The service role is only used after the guest session and slug are bound to
// the same property. Never expose serials, private notes, draft guidance, or
// unapproved manual text in this guest-facing inventory.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  const { slug } = await params;
  const admin = createAdminClient() as any;
  const { data: property, error: propertyError } = await admin.from('properties')
    .select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (propertyError || !property || property.slug !== slug) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }

  const { data, error } = await admin.from('property_appliances')
    .select('id, property_id, category, display_name, brand, model_number, location_note, guest_visible')
    .eq('property_id', session.propertyId).eq('guest_visible', true)
    .order('category', { ascending: true }).order('display_name', { ascending: true }).limit(101);
  if (error || !data || data.length > 100) {
    return NextResponse.json({ error: 'Could not load appliances.' }, { status: 500 });
  }
  if (data.length === 0) return NextResponse.json({ appliances: [] });

  const { data: answers, error: answersError } = await admin.from('appliance_answers')
    .select('id, property_id, appliance_id, question, answer, status, approved_at, model_number_snapshot')
    .eq('property_id', session.propertyId).eq('status', 'approved')
    .in('appliance_id', data.map((row: { id: string }) => row.id)).limit(501);
  if (answersError || !answers || answers.length > 500) {
    return NextResponse.json({ error: 'Could not load appliance questions.' }, { status: 500 });
  }

  return NextResponse.json({
    appliances: data.map((row: { id: string; property_id: string; category: string; display_name: string; brand: string | null; model_number: string | null; location_note: string | null; guest_visible: boolean }) => ({
      id: row.id,
      category: row.category,
      name: row.display_name,
      brand: row.brand,
      locationNote: row.location_note,
      questions: approvedApplianceAnswers({
        id: row.id, propertyId: session.propertyId, modelNumber: row.model_number, guestVisible: row.guest_visible,
      }, answers.map((answer: { id: string; property_id: string; appliance_id: string; question: string; answer: string; status: string; approved_at: string | null; model_number_snapshot: string | null }) => ({
        id: answer.id, propertyId: answer.property_id, applianceId: answer.appliance_id,
        question: answer.question, answer: answer.answer, status: answer.status,
        approvedAt: answer.approved_at, modelNumberSnapshot: answer.model_number_snapshot,
      }))).map((answer) => ({ id: answer.id, text: answer.question })),
    })),
  });
}
