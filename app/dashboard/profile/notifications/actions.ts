'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { NOTIFICATION_CATEGORIES, categorySupportsChannel, type NotificationChannel } from '@/lib/notifications/categories';

export interface NotificationPreferenceResult {
  ok: boolean;
  error?: string;
}

// Toggle one channel of one notification category. in_app is the master switch:
// off means the category leaves the bell/badge/history AND suppresses fan-out.
// email/sms are layered on top of an active master switch. Always-on paths
// (host messages, billing, system/security) are rejected HERE, not just
// disabled in the UI — a tampered client can never mute guaranteed paths.
export async function setNotificationPreferenceAction(input: {
  category: string;
  channel: NotificationChannel;
  enabled: boolean;
}): Promise<NotificationPreferenceResult> {
  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === input?.category);
  if (!category) return { ok: false, error: 'Unknown notification category.' };
  if (category.alwaysOn) {
    return { ok: false, error: `${category.label} is always on and cannot be turned off.` };
  }
  const channel = input?.channel;
  if (channel !== 'in_app' && channel !== 'email' && channel !== 'sms') {
    return { ok: false, error: 'Unknown channel.' };
  }
  if (channel !== 'in_app' && !categorySupportsChannel(category.key, channel)) {
    return {
      ok: false,
      error: `${category.label} is never sent by ${channel === 'sms' ? 'text message' : 'email'}.`,
    };
  }
  if (typeof input.enabled !== 'boolean') return { ok: false, error: 'Missing preference value.' };

  // Only the toggled channel's column is written; the other columns keep their
  // stored values on conflict and their DB defaults on first insert.
  const channelPatch =
    channel === 'in_app'
      ? { enabled: input.enabled }
      : channel === 'email'
        ? { email_enabled: input.enabled }
        : { sms_enabled: input.enabled };

  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase.from('notification_preferences').upsert(
    {
      host_account_id: ctx.account.id,
      profile_id: ctx.user.id,
      category: category.key,
      ...channelPatch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,category' },
  );
  if (error) {
    console.error('[notifications] preference save failed', { category: category.key, channel, error: error.message });
    return { ok: false, error: 'Could not save that change. Please try again.' };
  }

  await audit(supabase, {
    action: 'profile.notification_preference_changed',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
    metadata: { category: category.key, channel, enabled: input.enabled },
  });

  revalidatePath('/dashboard/profile/notifications');
  // The bell and unread badge filter on the in-app master switch, so the shared
  // dashboard layout needs a refresh too, not just this settings page.
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daily digest
// ---------------------------------------------------------------------------

// The member's global digest switch (profiles.email_digest_enabled). When on,
// digest-eligible categories (extras, review nudges, property knowledge) queue
// for the morning email instead of sending instantly. Urgent and always-on
// paths are never eligible, by construction in the category registry.
export async function setEmailDigestAction(enabled: boolean): Promise<NotificationPreferenceResult> {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'Missing value.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ email_digest_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', ctx.user.id);
  if (error) {
    console.error('[notifications] digest toggle failed', { error: error.message });
    return { ok: false, error: 'Could not save that change. Please try again.' };
  }

  await audit(supabase, {
    action: 'profile.email_digest_changed',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
    metadata: { email_digest_enabled: enabled },
  });

  revalidatePath('/dashboard/profile/notifications');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Per-property mutes
// ---------------------------------------------------------------------------

// Mute one notification path for one property only (e.g. extras pings for the
// beach house but not the city loft). The path stays on everywhere else.
export async function addPropertyMuteAction(input: {
  propertyId: string;
  category: string;
}): Promise<NotificationPreferenceResult> {
  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === input?.category);
  if (!category) return { ok: false, error: 'Unknown notification category.' };
  if (category.alwaysOn) {
    return { ok: false, error: `${category.label} is always on and cannot be muted.` };
  }
  if (!input?.propertyId) return { ok: false, error: 'Choose a property first.' };

  const ctx = await requireSession();
  const supabase = createClient();
  // Defense in depth alongside RLS: the property must belong to this account
  // before a mute row can reference it.
  const { data: property } = await supabase
    .from('properties')
    .select('id')
    .eq('id', input.propertyId)
    .eq('host_account_id', ctx.account.id)
    .maybeSingle();
  if (!property) return { ok: false, error: 'That property is not on your account.' };

  const { error } = await supabase.from('notification_property_mutes').upsert(
    {
      host_account_id: ctx.account.id,
      profile_id: ctx.user.id,
      property_id: input.propertyId,
      category: category.key,
    },
    { onConflict: 'profile_id,property_id,category' },
  );
  if (error) {
    console.error('[notifications] property mute failed', { category: category.key, error: error.message });
    return { ok: false, error: 'Could not add that mute. Please try again.' };
  }

  await audit(supabase, {
    action: 'profile.notification_property_muted',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'property',
    targetId: input.propertyId,
    metadata: { category: category.key },
  });

  revalidatePath('/dashboard/profile/notifications');
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

export async function removePropertyMuteAction(muteId: string): Promise<NotificationPreferenceResult> {
  if (!muteId) return { ok: false, error: 'Missing mute id.' };

  const ctx = await requireSession();
  const supabase = createClient();
  // RLS also scopes deletes to the caller; the explicit profile filter keeps a
  // revoked-policy regression from ever leaking a delete across members.
  const { error } = await supabase
    .from('notification_property_mutes')
    .delete()
    .eq('id', muteId)
    .eq('profile_id', ctx.user.id);
  if (error) {
    console.error('[notifications] property unmute failed', { error: error.message });
    return { ok: false, error: 'Could not remove that mute. Please try again.' };
  }

  await audit(supabase, {
    action: 'profile.notification_property_unmuted',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'notification_property_mute',
    targetId: muteId,
  });

  revalidatePath('/dashboard/profile/notifications');
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
