import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Guest-safe read of the property's appliance inventory (the Brain's
// property_appliances table). Powers the Appliances picker in the portal: the
// guest picks the exact appliance they mean, so the concierge question is
// specific and answerable from the Brain.
//
// RLS on property_appliances is host-only, so this route runs as the service
// role and scopes strictly to the session's own property. Only display fields
// are exposed — serial numbers, manual internals, and verification metadata
// stay host-side.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Your session has expired. Please verify again.' }, { status: 401 });

  const { slug } = await params;
  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();

  if (!property || property.id !== session.propertyId) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('property_appliances')
    .select('id, category, display_name, brand, location_note')
    .eq('property_id', session.propertyId)
    .order('category', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) return NextResponse.json({ error: 'Could not load appliances.' }, { status: 500 });

  return NextResponse.json({
    appliances: (data ?? []).map((row) => {
      const a = row as { id: string; category: string; display_name: string; brand: string | null; location_note: string | null };
      return {
        id: a.id,
        category: a.category,
        name: a.display_name,
        brand: a.brand,
        locationNote: a.location_note,
      };
    }),
  });
}
