import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { serializeGuestHistory, type GuestHistoryRow } from '@/lib/guest/history-replay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });
  const admin = createAdminClient();
  const { data: property, error: propertyError } = await admin.from('properties')
    .select('id, slug').eq('id', session.propertyId).maybeSingle();
  if (propertyError) return NextResponse.json({ error: 'Could not load chat history.' }, { status: 503 });
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }
  const { data: conv, error: convError } = await (admin as any).from('conversations')
    .select('id').eq('stay_id', session.stayId).eq('property_id', session.propertyId)
    .eq('channel', 'ai_concierge').eq('guest_session_id', session.sessionId).maybeSingle();
  if (convError) return NextResponse.json({ error: 'Could not load chat history.' }, { status: 503 });
  if (!conv) return NextResponse.json({ messages: [] });
  const conversationId = (conv as { id: string }).id;
  const after = new URL(req.url).searchParams.get('after');
  if (after && Number.isNaN(Date.parse(after))) {
    return NextResponse.json({ error: 'Invalid history cursor.' }, { status: 400 });
  }
  let priorWifiContext = false;
  if (after) {
    const { data: priorWifi, error } = await admin.from('messages')
      .select('id').eq('conversation_id', conversationId).eq('property_id', session.propertyId)
      .lte('created_at', after)
      .or(['wi%fi', 'wireless', 'internet', 'network', 'ssid', 'router']
        .map((topic) => `content.ilike.%${topic}%`).join(','))
      .limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: 'Could not load chat history.' }, { status: 503 });
    priorWifiContext = !!priorWifi;
  }
  let query = (admin as any).from('messages')
    .select('id, role, content, created_at, model, guest_replay_safe')
    .eq('conversation_id', conversationId).eq('property_id', session.propertyId)
    .order('created_at', { ascending: true }).limit(100);
  if (after) query = query.gt('created_at', after);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Could not load chat history.' }, { status: 503 });
  return NextResponse.json({ messages: serializeGuestHistory((data ?? []) as GuestHistoryRow[], priorWifiContext) });
}
