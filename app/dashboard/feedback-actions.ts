'use server';

import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';
import { hostFeedbackSchema } from '@/lib/validation';
import { log } from '@/lib/log';

export interface HostFeedbackState {
  error?: string;
  success?: string;
}

// Add-on — one-tap product feedback from a host. Writes a PRIVATE product_feedback row
// (source='host') scoped to the host's own account. The row is owner-only analytics
// (no read path in the app); RLS restricts inserts to source='host' rows owned by the
// caller. Non-blocking — a failure here never interrupts the dashboard.
export async function submitHostFeedbackAction(_prev: HostFeedbackState, formData: FormData): Promise<HostFeedbackState> {
  const ctx = await requireSession();

  const parsed = hostFeedbackSchema.safeParse({
    rating: Number(formData.get('rating') ?? 0),
    comment: formData.get('comment') || '',
    page: formData.get('page') || 'dashboard',
  });
  if (!parsed.success) return { error: 'Please choose a rating.' };

  const supabase = createClient();
  const { error } = await supabase.from('product_feedback').insert({
    source: 'host',
    rating: parsed.data.rating,
    comment: parsed.data.comment ? parsed.data.comment : null,
    host_account_id: ctx.account.id,
    page: parsed.data.page ? parsed.data.page : 'dashboard',
  } as never);

  if (error) {
    log.warn('host_feedback_failed', { error: error.message });
    return { error: 'Could not send your feedback. Please try again.' };
  }
  return { success: 'Thanks for the feedback!' };
}
