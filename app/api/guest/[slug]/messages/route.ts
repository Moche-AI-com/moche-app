import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Guest polling endpoint: returns messages in the guest's conversation, optionally only
// those newer than `after` (ISO timestamp). Used by the portal to surface host replies
// live and drive the two-way chat continuation. Scoped strictly to the session's own
// stay/property; guests are unauthenticated to Postgres so all reads go through the
// service-role client with explicit stay/property filters.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties')
    .select('id, slug')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== params.slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: conv } = await admin
    .from('conversations')
    .select('id')
    .eq('stay_id', session.stayId)
    .eq('property_id', session.propertyId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ messages: [] });
  const conversationId = (conv as { id: string }).id;

  const url = new URL(req.url);
  const after = url.searchParams.get('after');

  let query = admin
    .from('messages')
    .select('role, content, created_at, model')
    .eq('conversation_id', conversationId)
    .eq('property_id', session.propertyId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (after) {
    // Strictly-after so we only pull messages the client hasn't seen yet.
    query = query.gt('created_at', after);
  }
  const { data } = await query;

  // Never expose author profile ids or internal system rows to the guest. Map host
  // answers to a stable shape the portal renders as a "host" bubble.
  const messages = (data ?? [])
    .filter((m) => m.role === 'guest' || m.role === 'assistant' || m.role === 'host')
    .map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }));

  return NextResponse.json({ messages });
}
