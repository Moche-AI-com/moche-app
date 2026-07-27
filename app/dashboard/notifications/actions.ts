'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';

// Marks a single notification read. Scoped to the caller's own host account —
// the .eq('host_account_id', ...) makes this safe to call with any id, and the
// .is('read_at', null) makes repeat calls a no-op (idempotent).
export async function markNotificationReadAction(id: string): Promise<void> {
  if (!id) return;
  const ctx = await requireSession();
  const supabase = createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('id', id)
    .eq('host_account_id', ctx.account.id)
    .is('read_at', null);
  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard', 'layout');
}

// Marks every unread notification for the caller's host account as read.
export async function markAllNotificationsReadAction(): Promise<void> {
  const ctx = await requireSession();
  const supabase = createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('host_account_id', ctx.account.id)
    .is('read_at', null);
  revalidatePath('/dashboard/notifications');
  revalidatePath('/dashboard', 'layout');
}

// Form-compatible wrapper for the plain <form action={...}> on the full
// notifications page (works without client JS).
export async function markAllNotificationsReadFormAction(): Promise<void> {
  await markAllNotificationsReadAction();
}
