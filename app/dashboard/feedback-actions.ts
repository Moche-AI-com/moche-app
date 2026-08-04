'use server';

import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/auth/guards';
import { hostFeedbackSchema } from '@/lib/validation';
import { sendInternalEmail } from '@/lib/notify';
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

  // Ping the business inbox so we can follow up with the host. Best-effort: a delivery
  // failure must never turn a successfully-saved feedback into an error for the user.
  try {
    const { rating, comment, page } = parsed.data;
    const hostEmail = ctx.profile.email ?? 'unknown';
    const hostName = ctx.profile.full_name ?? 'A host';
    const stars = '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
    const lines = [
      `${hostName} left ${rating}/5 feedback on Moche-AI.`,
      '',
      `Rating:  ${stars} (${rating}/5)`,
      `Host:    ${hostName} <${hostEmail}>`,
      `Account: ${ctx.account.id}`,
      `Page:    ${page || 'dashboard'}`,
      `Time:    ${new Date().toISOString()}`,
      '',
      'Comment:',
      comment ? comment : '(no comment provided)',
    ];
    await sendInternalEmail(`New host feedback: ${rating}/5 from ${hostName}`, lines.join('\n'));
  } catch (e) {
    log.warn('host_feedback_email_failed', { error: String(e) });
  }

  return { success: 'Thanks for the feedback!' };
}
