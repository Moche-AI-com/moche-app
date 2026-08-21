import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePropertyAccess } from '@/lib/auth/guards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  if (!access.isOwner && !access.can.replyGuests) {
    return NextResponse.json({ error: 'You do not have permission to view stays.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('stays')
    .select('id, guest_display_name, check_in, check_out, status')
    .eq('property_id', propertyId)
    .in('status', ['upcoming', 'active'])
    .order('check_in', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: 'Could not load stays.' }, { status: 500 });
  return NextResponse.json({ stays: data ?? [] });
}
