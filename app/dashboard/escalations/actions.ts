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
  if (!access.can.editBrain) {
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
