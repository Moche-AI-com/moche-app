'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';

// Marks a single notification read. Scoped to the caller's own host account —
// the .eq('host_account_id', ...) makes this safe to call with any id, and the
// .is('read_at', null) makes repeat calls a no-op (idempotent).
export async function markNotificationReadAction(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'missing id' };
  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('host_account_id', ctx.account.id)
    .is('read_at', null);
  // Surface failures instead of swallowing them. A silent 0-row UPDATE (e.g. an
  // RLS policy that can't match) previously looked like success in the UI and
  // reverted on the next page load.
  if (error) {
    console.error('[notifications] markNotificationRead failed', { id, error: error.message });
    return { ok: false, error: error.message };
  }
  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// Marks every unread notification for the caller's host account as read.
export async function markAllNotificationsReadAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireSession();
  const supabase = createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('host_account_id', ctx.account.id)
    .is('read_at', null);
  if (error) {
    console.error('[notifications] markAllNotificationsRead failed', { error: error.message });
    return { ok: false, error: error.message };
  }
  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}

// Form-compatible wrapper for the plain <form action={...}> on the full
// notifications page (works without client JS).
export async function markAllNotificationsReadFormAction(): Promise<void> {
  await markAllNotificationsReadAction();
}
