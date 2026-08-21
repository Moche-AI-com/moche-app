import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AssistantCard = {
  key: string;
  title: string;
  description: string;
  prompt: string;
};

const CARD_DEFS: (AssistantCard & { moduleKey: string })[] = [
  { key: 'wifi', moduleKey: 'wifi', title: 'Wi-Fi', description: 'Network, password, and connection help.', prompt: 'What is the Wi-Fi network and password?' },
  { key: 'checkin', moduleKey: 'checkin', title: 'Check-in', description: 'Arrival steps, access timing, and entry details.', prompt: 'What are the check-in instructions?' },
  { key: 'checkout', moduleKey: 'checkout', title: 'Check-out', description: 'Departure time and checkout steps.', prompt: 'What are the check-out instructions?' },
  { key: 'parking', moduleKey: 'parking', title: 'Parking', description: 'Where to park and any parking rules.', prompt: 'Where should I park?' },
  { key: 'trash', moduleKey: 'cleaning', title: 'Trash days', description: 'Trash, recycling, and pickup guidance.', prompt: 'What should I know about trash and recycling days?' },
  { key: 'local', moduleKey: 'local', title: 'Local recommendations', description: 'Host-approved places, directions, and links.', prompt: 'What local places do you recommend?' },
  { key: 'house_rules', moduleKey: 'house_rules', title: 'House rules', description: 'Quiet hours, guests, pets, and smoking rules.', prompt: 'What are the house rules?' },
  { key: 'appliances', moduleKey: 'appliances', title: 'Appliance help', description: 'How to use approved appliances and amenities.', prompt: 'How do I use the appliances?' },
];

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

  const { data: settings } = await admin
    .from('property_settings')
    .select('modules')
    .eq('property_id', session.propertyId)
    .maybeSingle();

  const modules = ((settings as { modules?: Record<string, unknown> } | null)?.modules ?? {}) as Record<string, unknown>;
  const cards = CARD_DEFS
    .filter((card) => modules[card.moduleKey] !== false)
    .map(({ moduleKey: _moduleKey, ...card }) => card);

  return NextResponse.json({ cards });
}
