'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession, requirePropertyAccess } from '@/lib/auth/guards';
import { escalationRespondSchema } from '@/lib/validation';
import { reindexBrainItem } from '@/app/dashboard/properties/[id]/brain/actions';
import { notifyGuestReply } from '@/lib/notify';
import { publicEnv } from '@/lib/env';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';
import { capture } from '@/lib/posthog-server';
import { classifyBrainAnswer, type BrainCategory } from '@/lib/brain/classify';

type Client = SupabaseClient<Database>;

export interface EscalationActionState {
  error?: string;
  ok?: boolean;
}

// Shared learning loop (Part D1). SINGLE source of truth used by BOTH the dashboard
// answer form and the signed magic-link route (Feature 4b) — do not fork this logic.
// The caller is responsible for authorizing the actor BEFORE invoking this (dashboard:
// requirePropertyAccess; magic link: HMAC token verification). All writes go through the
// service-role admin client so it works with or without a Postgres session.
//
// The host's answer is (1) saved + embedded as a guest-visible host_qa Brain item so
// future guests get it instantly, (2) delivered back into the guest conversation,
// (3) recorded on the escalation, and (4) best-effort pinged to the guest IF and only if
// they gave TCPA consent on their session (Feature 4c).
export async function answerEscalationCore(
  admin: Client,
  opts: {
    escalationId: string;
    answerText: string;
    actorProfileId: string;
    // Whether to teach the Brain from this answer. When false, the answer is delivered
    // to the guest but NOT saved as reusable knowledge (one-off replies).
    convertToBrain?: boolean;
    // Optional host override for the Brain category. When omitted (and convertToBrain
    // is true), the answer is AI-classified into the best category with a normalized,
    // reusable title.
    brainCategory?: BrainCategory;
  },
): Promise<EscalationActionState> {
  const { escalationId, answerText, actorProfileId } = opts;
  const convertToBrain = opts.convertToBrain ?? true;

  const { data: esc } = await admin
    .from('escalations')
    .select('id, property_id, question, conversation_id, status, stay_id')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const { data: prop } = await admin
    .from('properties')
    .select('host_account_id, display_name, slug')
    .eq('id', esc.property_id)
    .maybeSingle();
  if (!prop) return { error: 'Escalation not found.' };

  let brainItemId: string | null = null;

  if (convertToBrain) {
    // Normalize + route: use the host's explicit category override, else AI-classify
    // into the best-fit bucket with a reusable, guest-agnostic title. This is what
    // makes saved answers properly labeled so retrieval serves them next time.
    let category: BrainCategory = opts.brainCategory ?? 'host_qa';
    let title = esc.question.trim().slice(0, 200);
    if (!opts.brainCategory) {
      const classified = await classifyBrainAnswer({ question: esc.question, answer: answerText });
      category = classified.category;
      title = classified.title;
    }

    // 1. Create the guest-visible Brain item from the answered question.
    const { data: created, error: biErr } = await admin
      .from('brain_items')
      .insert({
        property_id: esc.property_id,
        title,
        body: answerText,
        category,
        visibility: 'guest',
        source_type: 'host_qa',
        status: 'ready',
        created_by: actorProfileId,
      } as never)
      .select('id')
      .single();
    if (biErr || !created) {
      log.warn('escalation_brain_create_failed', { error: biErr?.message });
      return { error: 'Could not save the answer to your Brain.' };
    }
    brainItemId = (created as { id: string }).id;

    // 2. Embed it so retrieval can serve it. reindexBrainItem also bumps the Brain
    //    version + clears the answer cache for this property (Part E invalidation).
    await reindexBrainItem(esc.property_id, brainItemId, title, answerText, 'guest', category);
  }

  // 3. Record the response on the escalation and link any created Brain item.
  await admin
    .from('escalations')
    .update({
      host_response: answerText,
      status: 'answered',
      responded_at: new Date().toISOString(),
      responded_by: actorProfileId,
      converted_brain_item_id: brainItemId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', escalationId)
    .eq('property_id', esc.property_id);

  // 4. Deliver the answer into the guest conversation so it appears live in their chat.
  //    Stored with role 'host' (distinct from the AI 'assistant') so the guest portal
  //    can render + poll for it separately and continue the thread two-way.
  if (esc.conversation_id) {
    await admin.from('messages').insert({
      conversation_id: esc.conversation_id,
      property_id: esc.property_id,
      role: 'host',
      content: answerText,
      author_profile_id: actorProfileId,
      model: 'host_answer',
    } as never);
  }

  // 4c. Best-effort guest ping — ONLY if the guest opted in on their session.
  await maybePingGuest(admin, {
    stayId: esc.stay_id,
    propertyName: (prop as { display_name: string }).display_name,
    slug: (prop as { slug: string }).slug,
  });

  await audit(admin, {
    action: 'escalation.answered',
    actorProfileId,
    hostAccountId: (prop as { host_account_id: string }).host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  await capture('escalation_answered', esc.property_id, { property_id: esc.property_id });

  revalidatePath('/dashboard/escalations');
  revalidatePath(`/dashboard/escalations/${escalationId}`);
  return { ok: true };
}

// Looks up the guest's opted-in notify contact for this stay and pings them that the
// host replied. Consent is mandatory: notification_consent must be true. Never pings
// otherwise; never logs the contact.
async function maybePingGuest(
  admin: Client,
  p: { stayId: string | null; propertyName: string; slug: string },
): Promise<void> {
  if (!p.stayId) return;
  const { data: sess } = await admin
    .from('guest_access_sessions')
    .select('guest_contact, notification_consent')
    .eq('stay_id', p.stayId)
    .eq('notification_consent', true)
    .not('guest_contact', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const contact = (sess as { guest_contact: string | null } | null)?.guest_contact;
  if (!sess || !contact) return;
  await notifyGuestReply({
    contact,
    propertyName: p.propertyName,
    portalUrl: `${publicEnv.appUrl}/g/${p.slug}`,
  });
}

// Answer an escalated guest question from the dashboard. Authorizes via the host session
// + property access, then runs the shared learning loop above.
export async function answerEscalationAction(
  _prev: EscalationActionState,
  formData: FormData,
): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  // The form sends the answer plus the host's save choice: whether to teach the Brain
  // and an optional category override ('' → let the AI classify).
  const rawCategory = formData.get('brainCategory');
  const parsed = escalationRespondSchema.safeParse({
    response: formData.get('response'),
    convertToBrain: formData.get('convertToBrain') === 'on' || formData.get('convertToBrain') === 'true',
    brainCategory: rawCategory && rawCategory !== '' ? rawCategory : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please write an answer.' };
  }
  const answerText = parsed.data.response;
  const convertToBrain = parsed.data.convertToBrain;
  // Only treat a category as an explicit override when the host actually chose one
  // AND opted to save. The zod default fills 'host_qa'; we distinguish "host picked a
  // specific bucket" from "let AI decide" by inspecting the raw form value.
  const hostPickedCategory =
    typeof rawCategory === 'string' && rawCategory !== '' && rawCategory !== 'auto';

  const ctx = await requireSession();
  const supabase = createClient();

  // RLS scopes escalations through properties the host can see.
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations || !access.can.replyGuests) {
    return { error: 'You do not have permission to reply to guests for this property.' };
  }
  if (convertToBrain && !access.can.editBrain) {
    return { error: 'You do not have permission to teach this property Brain.' };
  }

  return answerEscalationCore(createAdminClient(), {
    escalationId,
    answerText,
    actorProfileId: ctx.user.id,
    convertToBrain,
    brainCategory: convertToBrain && hostPickedCategory ? parsed.data.brainCategory : undefined,
  });
}

export interface EscalationThreadTarget {
  url?: string;
  error?: string;
}

// Where an escalation gets handled: the guest's Host Chat thread. The escalation
// row remembers the thread (host_conversation_id) once it exists, so resolving is
// a plain lookup from then on. A first open creates the thread, mirroring the
// guest-side creation in app/api/guest/[slug]/host-chat/route.ts.
export async function openEscalationThreadAction(escalationId: string): Promise<EscalationThreadTarget> {
  await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, stay_id, host_conversation_id, guest_session_id, guest_identity_id, stay_guest_id')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };

  // Legacy rows without a stay have no thread to route to — the detail page
  // stays as their fallback surface.
  if (!esc.stay_id) return { url: `/dashboard/escalations/${escalationId}` };

  const admin = createAdminClient();
  const db = admin as any;
  const propertyId = esc.property_id;
  const stayId = esc.stay_id;

  let conversationId = esc.host_conversation_id ?? null;

  if (!conversationId && esc.guest_session_id) {
    const { data } = await db
      .from('conversations')
      .select('id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .eq('channel', 'host_chat')
      .eq('guest_session_id', esc.guest_session_id)
      .maybeSingle();
    conversationId = data?.id ?? null;
  }
  if (!conversationId && esc.guest_identity_id) {
    const { data } = await db
      .from('conversations')
      .select('id')
      .eq('property_id', propertyId)
      .eq('stay_id', stayId)
      .eq('channel', 'host_chat')
      .eq('guest_identity_id', esc.guest_identity_id)
      .maybeSingle();
    conversationId = data?.id ?? null;
  }

  if (!conversationId) {
    let guestName = 'Guest';
    if (esc.guest_identity_id) {
      const { data: identity } = await db
        .from('guest_identities')
        .select('first_name, last_name, display_name')
        .eq('id', esc.guest_identity_id)
        .maybeSingle();
      const full = [identity?.first_name, identity?.last_name].filter(Boolean).join(' ').trim();
      if (full || identity?.display_name) guestName = full || identity.display_name;
    }
    if (guestName === 'Guest') {
      const { data: stay } = await db.from('stays').select('guest_display_name').eq('id', stayId).maybeSingle();
      if (stay?.guest_display_name) guestName = stay.guest_display_name;
    }

    const now = new Date().toISOString();
    const { data: created, error: convErr } = await db
      .from('conversations')
      .insert({
        property_id: propertyId,
        stay_id: stayId,
        title: `Host Chat — ${guestName}`,
        channel: 'host_chat',
        guest_session_id: esc.guest_session_id,
        guest_identity_id: esc.guest_identity_id,
        stay_guest_id: esc.stay_guest_id,
        last_message_at: now,
      })
      .select('id')
      .single();
    if (convErr || !created) {
      log.warn('escalation_thread_create_failed', { error: convErr?.message });
      return { error: 'Could not open the guest thread. Please try again.' };
    }
    conversationId = created.id;
  }

  // Remember the thread on the escalation so every later open is a plain lookup.
  if (!esc.host_conversation_id) {
    await db
      .from('escalations')
      .update({ host_conversation_id: conversationId, updated_at: new Date().toISOString() })
      .eq('id', escalationId);
  }

  return { url: `/dashboard/properties/${propertyId}/stays/${stayId}/conversations/${conversationId}?escalation=${escalationId}` };
}

const INBOX_STATUS_SET = ['resolved', 'answered', 'dismissed'] as const;

// Status change without a reply, from the inbox row menu: mark handled, mark
// awaiting-guest, or cancel a duplicate/irrelevant escalation. Reply-linked
// transitions stay in the thread composer (guest-chats messages route).
export async function setEscalationStatusAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!escalationId || !(INBOX_STATUS_SET as readonly string[]).includes(status)) return { error: 'Missing escalation or status.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };
  if (esc.status === status) return { ok: true };

  const now = new Date().toISOString();
  const terminal = status !== 'answered';
  const { error } = await supabase
    .from('escalations')
    .update({
      status: status as 'resolved' | 'answered' | 'dismissed',
      resolved_at: terminal ? now : null,
      pinned: !terminal,
      updated_at: now,
    } as never)
    .eq('id', escalationId);
  if (error) return { error: 'Could not update the escalation.' };

  await audit(supabase, {
    action: `escalation.${status}`,
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  revalidatePath('/dashboard/escalations');
  return { ok: true };
}

// Close = archive out of the inbox into Reports. Only terminal rows (handled or
// cancelled) can close; reopening puts the row back in the inbox as it was.
export async function closeEscalationAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id, status')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };
  if (esc.status !== 'resolved' && esc.status !== 'dismissed') {
    return { error: 'Only handled or cancelled escalations can be closed.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('escalations')
    .update({ lifecycle_status: 'archived', archived_at: now, updated_at: now } as never)
    .eq('id', escalationId);
  if (error) return { error: 'Could not close the escalation.' };

  await audit(supabase, {
    action: 'escalation.closed',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  revalidatePath('/dashboard/escalations');
  revalidatePath('/dashboard/reports');
  return { ok: true };
}

export async function reopenEscalationAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const escalationId = String(formData.get('escalationId') ?? '');
  if (!escalationId) return { error: 'Missing escalation.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { data: esc } = await supabase
    .from('escalations')
    .select('id, property_id')
    .eq('id', escalationId)
    .maybeSingle();
  if (!esc) return { error: 'Escalation not found.' };

  const access = await requirePropertyAccess(esc.property_id);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };

  const { error } = await supabase
    .from('escalations')
    .update({ lifecycle_status: 'active', archived_at: null, updated_at: new Date().toISOString() } as never)
    .eq('id', escalationId);
  if (error) return { error: 'Could not reopen the escalation.' };

  await audit(supabase, {
    action: 'escalation.reopened',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId: esc.property_id,
    targetType: 'escalation',
    targetId: escalationId,
  });
  revalidatePath('/dashboard/escalations');
  revalidatePath('/dashboard/reports');
  return { ok: true };
}

// Bulk close for a property group header: archives every handled/cancelled row
// still active for that property.
export async function closeHandledEscalationsAction(_prev: EscalationActionState, formData: FormData): Promise<EscalationActionState> {
  const propertyId = String(formData.get('propertyId') ?? '');
  if (!propertyId) return { error: 'Missing property.' };

  const ctx = await requireSession();
  const access = await requirePropertyAccess(propertyId);
  if (!access.can.receiveEscalations) return { error: 'You do not have permission to manage escalations for this property.' };

  const supabase = createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('escalations')
    .update({ lifecycle_status: 'archived', archived_at: now, updated_at: now } as never)
    .eq('property_id', propertyId)
    .eq('lifecycle_status', 'active')
    .in('status', ['resolved', 'dismissed']);
  if (error) return { error: 'Could not close the handled escalations.' };

  await audit(supabase, {
    action: 'escalation.closed_all',
    actorProfileId: ctx.user.id,
    hostAccountId: access.property.host_account_id,
    propertyId,
    targetType: 'property',
    targetId: propertyId,
  });
  revalidatePath('/dashboard/escalations');
  revalidatePath('/dashboard/reports');
  return { ok: true };
}
