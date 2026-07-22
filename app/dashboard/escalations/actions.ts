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
  opts: { escalationId: string; answerText: string; actorProfileId: string },
): Promise<EscalationActionState> {
  const { escalationId, answerText, actorProfileId } = opts;

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

  const title = esc.question.trim().slice(0, 200);

  // 1. Create the host_qa Brain item (guest-visible) from the answered question.
  const { data: created, error: biErr } = await admin
    .from('brain_items')
    .insert({
      property_id: esc.property_id,
      title,
      body: answerText,
      category: 'host_qa',
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
  const brainItemId = (created as { id: string }).id;

  // 2. Embed it so retrieval can serve it. reindexBrainItem also bumps the Brain
  //    version + clears the answer cache for this property (Part E invalidation).
  await reindexBrainItem(esc.property_id, brainItemId, title, answerText, 'guest', 'host_qa');

  // 3. Record the response on the escalation and link the created Brain item.
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

  // 4. Deliver the answer into the guest conversation so it appears in their chat.
  if (esc.conversation_id) {
    await admin.from('messages').insert({
      conversation_id: esc.conversation_id,
      property_id: esc.property_id,
      role: 'assistant',
      content: `Your host says: ${answerText}`,
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

  const parsed = escalationRespondSchema.safeParse({ response: formData.get('response') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please write an answer.' };
  }
  const answerText = parsed.data.response;

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
  if (!access.can.editBrain) {
    return { error: 'You do not have permission to teach this property Brain.' };
  }

  return answerEscalationCore(createAdminClient(), {
    escalationId,
    answerText,
    actorProfileId: ctx.user.id,
  });
}
