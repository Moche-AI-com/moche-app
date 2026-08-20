import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { guestEscalateSchema } from '@/lib/validation';
import { checkRateLimit } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Message Host Directly (portal v2, workflow 2) — a human-only channel.
//
// Messages are stored on escalations rows with conversation_id NULL. That is
// the load-bearing detail: the AI concierge conversation (and its maybeSingle
// lookups in the chat/messages routes) is never touched, so AI chat and host
// chat share no UI, routing, or context. Host replies land in
// escalations.host_response via the existing dashboard reply action — its
// `if (esc.conversation_id)` guard keeps them out of the AI thread too.

type HostChatRow = {
  id: string;
  question: string;
  host_response: string | null;
  responded_at: string | null;
  status: string;
  created_at: string;
};

async function authorize(slug: string) {
  const session = await getGuestSession();
  if (!session) return { error: NextResponse.json({ error: 'Session expired.' }, { status: 401 }) } as const;
  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('id, slug, host_account_id')
    .eq('id', session.propertyId)
    .maybeSingle();
  if (!property || property.slug !== slug) {
    return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) } as const;
  }
  return { session, admin, property } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorize((await params).slug);
  if ('error' in auth) return auth.error;
  const { session, admin } = auth;

  const { data } = await admin
    .from('escalations')
    .select('id, question, host_response, responded_at, status, created_at')
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .is('conversation_id', null)
    .order('created_at', { ascending: true })
    .limit(100);

  // Each escalation is one guest message plus, once answered, one host reply.
  const messages: { id: string; from: 'guest' | 'host'; text: string; at: string; status?: string }[] = [];
  for (const row of (data ?? []) as HostChatRow[]) {
    messages.push({
      id: `${row.id}-g`,
      from: 'guest',
      text: row.question,
      at: row.created_at,
      status: row.host_response ? 'answered' : 'waiting',
    });
    if (row.host_response) {
      messages.push({
        id: `${row.id}-h`,
        from: 'host',
        text: row.host_response,
        at: row.responded_at ?? row.created_at,
      });
    }
  }

  return NextResponse.json({ messages });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorize((await params).slug);
  if ('error' in auth) return auth.error;
  const { session, admin, property } = auth;

  const rl = await checkRateLimit(admin, {
    key: `guest_host_chat:${session.stayId}`,
    limit: 30,
    windowSeconds: 3600,
    action: 'guest.host_chat',
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many messages. Please wait a moment and try again.' }, { status: 429 });
  }

  const parsed = guestEscalateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please type a message.' }, { status: 400 });
  }
  const message = parsed.data.message;

  // Duplicate-submit guard: an identical open message from the last 10 minutes
  // is returned instead of creating a second escalation.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: dupe } = await admin
    .from('escalations')
    .select('id')
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .is('conversation_id', null)
    .eq('status', 'open')
    .eq('question', message)
    .gte('created_at', since)
    .maybeSingle();
  if (dupe) return NextResponse.json({ ok: true, id: dupe.id, duplicate: true });

  const { data: created, error } = await admin
    .from('escalations')
    .insert({
      property_id: session.propertyId,
      stay_id: session.stayId,
      conversation_id: null,
      question: message,
      status: 'open',
    } as never)
    .select('id')
    .single();
  if (error || !created) {
    log.error('guest_host_chat_insert_failed', { propertyId: session.propertyId, err: String(error) });
    return NextResponse.json({ error: 'Could not send your message. Please try again.' }, { status: 500 });
  }

  // Same host fan-out as a manual escalation (in-app row + email/SMS per prefs).
  await notify(admin, {
    hostAccountId: property.host_account_id,
    kind: 'escalation',
    title: 'A guest is messaging you',
    body: message.length > 300 ? `${message.slice(0, 300)}…` : message,
    propertyId: session.propertyId,
  });

  log.info('guest_host_chat_message', { propertyId: session.propertyId, stayId: session.stayId });
  return NextResponse.json({ ok: true, id: created.id });
}
