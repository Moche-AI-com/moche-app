import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { redactCredentials } from '@/lib/brain/redact';
import { WIFI_CONTEXT } from '@/lib/guest/wifi-instructions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Guest polling endpoint: returns messages in the guest's OWN concierge
// conversation, optionally only those newer than `after` (ISO timestamp).
//
// Party access redesign 2026-08-28: the concierge conversation is scoped to the
// session (stay + channel=ai_concierge + guest_session_id), matching host chat.
// Each member of the party has a private Q&A history on their own device
// instead of one shared stay-wide thread. Legacy stay-scoped conversations
// (guest_session_id NULL) simply never match these queries.
//
// Scoped strictly to the session's own stay/property; guests are
// unauthenticated to Postgres so all reads go through the service-role client
// with explicit stay/property/session filters.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getGuestSession();
  if (!session) return NextResponse.json({ error: 'Session expired.' }, { status: 401 });

  const admin = createAdminClient();

  const { data: property } = await admin
    .from('properties')
    .select('id, slug')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== (await params).slug) {
    return NextResponse.json({ error: 'Session mismatch.' }, { status: 403 });
  }

  const { data: conv } = await (admin as any)
    .from('conversations')
    .select('id')
    .eq('stay_id', session.stayId)
    .eq('property_id', session.propertyId)
    .eq('channel', 'ai_concierge')
    .eq('guest_session_id', session.sessionId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ messages: [] });
  const conversationId = (conv as { id: string }).id;

  const url = new URL(req.url);
  const after = url.searchParams.get('after');
  let wifiContext = false;
  if (after) {
    // A delta may start with a bare answer whose Wi-Fi question was in an older
    // poll. Check topic existence, not full historical content, scoped to this
    // same private concierge conversation. A read failure must not enable replay.
    const { data: priorWifi, error } = await admin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('property_id', session.propertyId)
      .lte('created_at', after)
      .or(['wi%fi', 'wireless', 'internet', 'network', 'ssid', 'router']
        .map((topic) => `content.ilike.%${topic}%`).join(','))
      .limit(1)
      .maybeSingle();
    wifiContext = !!error || !!priorWifi;
  }

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
    .map((m) => {
      wifiContext ||= WIFI_CONTEXT.test(m.content);
      // Historical AI prose is not approved property truth. Do not replay a
      // password, a context-only passphrase, or an old invented physical location.
      // Keep context sticky: an implicit follow-up need not repeat "Wi-Fi".
      // Direct host-chat endpoints and explicit guest/host messages are unchanged.
      const content = m.role !== 'assistant' ? m.content : wifiContext
        ? 'This earlier Wi-Fi answer is unavailable. Ask the host for the current password location and connection instructions.'
        : redactCredentials(m.content).text;
      return { role: m.role, content, created_at: m.created_at };
    });

  return NextResponse.json({ messages });
}
