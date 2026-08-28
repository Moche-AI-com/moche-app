'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';
import { audit } from '@/lib/audit';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories';

export interface NotificationPreferenceResult {
  ok: boolean;
  error?: string;
}

// Subscribe/unsubscribe from one notification category. Always-on paths (host
// messages, billing, system/security) are rejected HERE, not just disabled in
// the UI — a tampered client can never mute the paths the product guarantees.
export async function setNotificationPreferenceAction(input: {
  category: string;
  enabled: boolean;
}): Promise<NotificationPreferenceResult> {
  const category = NOTIFICATION_CATEGORIES.find((c) => c.key === input?.category);
  if (!category) return { ok: false, error: 'Unknown notification category.' };
  if (category.alwaysOn) {
    return { ok: false, error: `${category.label} is always on and cannot be turned off.` };
  }
  if (typeof input.enabled !== 'boolean') return { ok: false, error: 'Missing preference value.' };

  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase.from('notification_preferences').upsert(
    {
      host_account_id: ctx.account.id,
      profile_id: ctx.user.id,
      category: category.key,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,category' },
  );
  if (error) {
    console.error('[notifications] preference save failed', { category: category.key, error: error.message });
    return { ok: false, error: 'Could not save that change. Please try again.' };
  }

  await audit(supabase, {
    action: 'profile.notification_preference_changed',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
    metadata: { category: category.key, enabled: input.enabled },
  });

  revalidatePath('/dashboard/profile/notifications');
  // The bell and unread badge filter on these preferences, so the shared
  // dashboard layout needs a refresh too, not just this settings page.
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
