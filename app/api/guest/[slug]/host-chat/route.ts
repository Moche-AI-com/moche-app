import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGuestSession } from '@/lib/guest/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { notify } from '@/lib/notify';
import { resolveLanguage, DEFAULT_HOST_LANGUAGE } from '@/lib/guest/languages';
import { translateForHost } from '@/lib/guest/translate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
  message: z.string().trim().min(1, 'Write a message first.').max(2000),
  replyToMessageId: z.string().uuid().optional(),
  escalationId: z.string().uuid().optional(),
  // The guest's portal language (Globe picker). Optional — older clients and
  // "Automatic" mode simply send nothing, and no translation runs.
  language: z.string().trim().max(40).optional(),
});

type AuthSuccess = {
  session: NonNullable<Awaited<ReturnType<typeof getGuestSession>>>;
  admin: ReturnType<typeof createAdminClient>;
  property: { id: string; slug: string; display_name: string; host_account_id: string };
};

async function authorize(slug: string): Promise<AuthSuccess | { error: NextResponse }> {
  const session = await getGuestSession();
  if (!session) return { error: NextResponse.json({ error: 'Session expired.' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: property } = await admin
    .from('properties')
    .select('id, slug, display_name, host_account_id')
    .eq('slug', slug)
    .maybeSingle();

  if (!property || property.id !== session.propertyId) {
    return { error: NextResponse.json({ error: 'Property not found.' }, { status: 404 }) };
  }

  return { session, admin, property: property as AuthSuccess['property'] };
}

async function sessionProfile(admin: ReturnType<typeof createAdminClient>, sessionId: string) {
  const { data } = await (admin as any)
    .from('guest_access_sessions')
    .select('guest_identity_id, guest_contact, notification_consent')
    .eq('id', sessionId)
    .maybeSingle();
  return data as { guest_identity_id: string | null; guest_contact: string | null; notification_consent: boolean } | null;
}

async function findHostConversation(admin: ReturnType<typeof createAdminClient>, session: AuthSuccess['session']) {
  const { data } = await (admin as any)
    .from('conversations')
    .select('id, title, guest_session_id, guest_identity_id, host_read_at, guest_read_at')
    .eq('property_id', session.propertyId)
    .eq('stay_id', session.stayId)
    .eq('channel', 'host_chat')
    .eq('guest_session_id', session.sessionId)
    .maybeSingle();
  return data as { id: string; title: string | null; guest_session_id: string | null; guest_identity_id: string | null; host_read_at: string | null; guest_read_at: string | null } | null;
}

async function getOrCreateHostConversation(admin: ReturnType<typeof createAdminClient>, session: AuthSuccess['session']) {
  const existing = await findHostConversation(admin, session);
  if (existing) return existing;

  const profile = await sessionProfile(admin, session.sessionId);
  const now = new Date().toISOString();
  const { data, error } = await (admin as any)
    .from('conversations')
    .insert({
      property_id: session.propertyId,
      stay_id: session.stayId,
      title: `Host Chat — ${session.guestDisplayName}`,
      channel: 'host_chat',
      guest_session_id: session.sessionId,
      guest_identity_id: profile?.guest_identity_id ?? null,
      last_message_at: now,
      guest_read_at: now,
    })
    .select('id, title, guest_session_id, guest_identity_id, host_read_at, guest_read_at')
    .single();
  if (error) throw error;
  return data as NonNullable<Awaited<ReturnType<typeof findHostConversation>>>;
}

function mapMessage(row: any) {
  return {
    id: row.id as string,
    role: row.role as 'guest' | 'host' | 'system' | 'assistant',
    content: row.content as string,
    createdAt: row.created_at as string,
    messageKind: (row.message_kind ?? 'text') as string,
    replyToMessageId: (row.reply_to_message_id ?? null) as string | null,
    escalationId: (row.escalation_id ?? null) as string | null,
    // Host-facing auto-translation of a guest message (null when the guest
    // writes in the host's language or translation was skipped/failed).
    hostTranslation: (row.host_translation ?? null) as string | null,
    hostTranslationLang: (row.host_translation_lang ?? null) as string | null,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorize((await params).slug);
  if ('error' in auth) return auth.error;

  const conversation = await findHostConversation(auth.admin, auth.session);
  if (!conversation) return NextResponse.json({ conversationId: null, messages: [] });

  const { data: rows, error } = await (auth.admin as any)
    .from('messages')
    .select('id, role, content, created_at, message_kind, reply_to_message_id, escalation_id, host_translation, host_translation_lang')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(300);

  if (error) return NextResponse.json({ error: 'Could not load messages.' }, { status: 500 });

  await (auth.admin as any)
    .from('conversations')
    .update({ guest_read_at: new Date().toISOString() })
    .eq('id', conversation.id);

  return NextResponse.json({ conversationId: conversation.id, messages: (rows ?? []).map(mapMessage) });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorize((await params).slug);
  if ('error' in auth) return auth.error;
  const { session, admin, property } = auth;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });

  const rate = await checkRateLimit(admin, {
    key: `guest_host_chat:${session.sessionId}`,
    action: 'guest.host_chat',
    limit: 60,
    windowSeconds: 3600,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many messages. Please wait a moment and try again.' }, { status: 429 });
  }

  const conversation = await getOrCreateHostConversation(admin, session);
  const replyToId = parsed.data.replyToMessageId ?? null;
  if (replyToId) {
    const { data: replyTo } = await (admin as any)
      .from('messages')
      .select('id')
      .eq('id', replyToId)
      .eq('conversation_id', conversation.id)
      .maybeSingle();
    if (!replyTo) return NextResponse.json({ error: 'The message you are replying to was not found.' }, { status: 404 });
  }

  // A guest can attach their reply to one of this stay's escalations. The row is
  // verified against the session's own property + stay before it is used, so a
  // guest can never write onto another stay's escalation.
  let escalation: { id: string; status: string } | null = null;
  if (parsed.data.escalationId) {
    const { data } = await (admin as any)
      .from('escalations')
      .select('id, status')
      .eq('id', parsed.data.escalationId)
      .eq('property_id', session.propertyId)
      .eq('stay_id', session.stayId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'That escalation was not found for this stay.' }, { status: 404 });
    escalation = data;
  }

  // Guest UX pass — translate the guest's words into the host's language so the
  // host reads Host Chat without a translator app. The ORIGINAL stays in
  // `content` untouched (a mistranslated door code must never be the only copy);
  // the translation rides in its own columns for host-facing surfaces. Same
  // language on both sides (or an unknown picker value) stores no translation.
  const guestLanguage = resolveLanguage(parsed.data.language);
  let hostTranslation: string | null = null;
  let hostTranslationLang: string | null = null;
  if (guestLanguage) {
    const { data: langSettings } = await (admin as any)
      .from('property_settings')
      .select('host_language')
      .eq('property_id', session.propertyId)
      .maybeSingle();
    const hostLanguage = (langSettings?.host_language as string | null) ?? DEFAULT_HOST_LANGUAGE;
    const translated = await translateForHost(parsed.data.message, guestLanguage.code, hostLanguage);
    hostTranslation = translated.translated;
    hostTranslationLang = translated.translated ? (resolveLanguage(hostLanguage)?.code ?? DEFAULT_HOST_LANGUAGE) : null;

    // Persist the choice on the stay so every later surface (notifications, a
    // second device, the next visit) knows what the guest reads.
    void (admin as any).from('stays').update({ guest_language: guestLanguage.code }).eq('id', session.stayId);
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await (admin as any)
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      property_id: session.propertyId,
      role: 'guest',
      content: parsed.data.message,
      message_kind: 'text',
      reply_to_message_id: replyToId,
      escalation_id: escalation?.id ?? null,
      host_translation: hostTranslation,
      host_translation_lang: hostTranslationLang,
    })
    .select('id, role, content, created_at, message_kind, reply_to_message_id, escalation_id, host_translation, host_translation_lang')
    .single();

  if (error) return NextResponse.json({ error: 'Could not send your message.' }, { status: 500 });

  await (admin as any)
    .from('conversations')
    .update({ last_message_at: now, host_read_at: null, guest_read_at: now })
    .eq('id', conversation.id);

  // A guest reply on an answered/handled escalation reopens it (owner decision
  // 2026-08-24): the host sees it pinned again instead of missing the follow-up.
  // Reopening also un-archives, so a reply to an already-closed escalation still
  // surfaces in the inbox.
  let reopened = false;
  if (escalation && escalation.status !== 'open') {
    await (admin as any)
      .from('escalations')
      .update({ status: 'open', pinned: true, resolved_at: null, lifecycle_status: 'active', archived_at: null })
      .eq('id', escalation.id);
    reopened = true;
  }

  // A follow-up not attached to a specific escalation still reopens anything in
  // this thread that was waiting on the guest ("awaiting guest response") — the
  // guest just responded. Handled/cancelled rows stay as they are: a new issue
  // gets its own escalation.
  if (!escalation) {
    const { data: waiting } = await (admin as any)
      .from('escalations')
      .update({ status: 'open', pinned: true, resolved_at: null, updated_at: now })
      .eq('host_conversation_id', conversation.id)
      .eq('status', 'answered')
      .select('id');
    reopened = (waiting?.length ?? 0) > 0;
  }

  // Guest chat messages get their own always-on kind ('host_message') instead
  // of overloading 'system', so hosts can never unsubscribe from the direct
  // guest line and 'system' stays reserved for security/platform alerts.
  // Reopened escalations keep the 'escalation' kind and its SMS fan-out path.
  await notify(admin, {
    hostAccountId: property.host_account_id,
    kind: reopened ? 'escalation' : 'host_message',
    title: reopened ? `Escalation reopened at ${property.display_name}` : `New guest message at ${property.display_name}`,
    body: reopened
      ? `${session.guestDisplayName} replied in Host Chat — an escalation needs another look.`
      : `${session.guestDisplayName} sent a message in Host Chat.`,
    propertyId: property.id,
    // Deep link straight into the full-page conversation (Stays redesign).
    link: `/dashboard/properties/${property.id}/stays/${session.stayId}/conversations/${conversation.id}`,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, conversationId: conversation.id, message: mapMessage(inserted) });
}
