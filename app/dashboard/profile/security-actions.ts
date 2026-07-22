'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession } from '@/lib/auth/guards';
import { hostPhoneSchema, hostOtpConfirmSchema } from '@/lib/validation';
import { createAndSendHostOtp, verifyHostOtp } from '@/lib/auth/host-otp';
import { audit } from '@/lib/audit';
import { log } from '@/lib/log';

export interface SecurityFormState {
  error?: string;
  success?: string;
  codeSent?: boolean;
}

// Step 1 — host requests a verification code to a phone number they control.
export async function sendPhoneOtpAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const ctx = await requireSession();
  const parsed = hostPhoneSchema.safeParse({ phone: formData.get('phone') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter a valid phone number.' };

  const res = await createAndSendHostOtp(createAdminClient(), {
    userId: ctx.user.id,
    phone: parsed.data.phone,
    purpose: 'phone_verify',
  });
  if (!res.ok) {
    return {
      error: res.rateLimited
        ? 'Too many code requests. Please wait a little while and try again.'
        : 'We could not send a code to that number. Check it and try again.',
    };
  }
  return { success: 'We sent a 6-digit code to that number.', codeSent: true };
}

// Step 2 — host enters the code (and optionally opts into operational SMS, TCPA consent).
// On success the phone is saved + marked verified, resolving notify.ts TODO(consent).
export async function verifyPhoneOtpAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const ctx = await requireSession();
  const parsed = hostOtpConfirmSchema.safeParse({
    phone: formData.get('phone'),
    code: formData.get('code'),
    optIn: formData.get('optIn') === 'on' || formData.get('optIn') === 'true',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter the 6-digit code.', codeSent: true };

  const admin = createAdminClient();
  const ok = await verifyHostOtp(admin, { userId: ctx.user.id, purpose: 'phone_verify', code: parsed.data.code });
  if (!ok) return { error: 'That code is invalid or has expired.', codeSent: true };

  const now = new Date().toISOString();
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      phone: parsed.data.phone,
      phone_verified_at: now,
      sms_opt_in: parsed.data.optIn,
      sms_opt_in_at: parsed.data.optIn ? now : null,
      updated_at: now,
    })
    .eq('id', ctx.user.id);
  if (error) {
    log.warn('phone_verify_persist_failed', { error: error.message });
    return { error: 'Could not save your phone. Please try again.', codeSent: true };
  }

  await audit(supabase, {
    action: 'profile.phone_verified',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
    metadata: { sms_opt_in: parsed.data.optIn },
  });
  revalidatePath('/dashboard/profile');
  return {
    success: parsed.data.optIn
      ? 'Phone verified and SMS alerts enabled.'
      : 'Phone verified. You can enable SMS alerts any time.',
  };
}

// Toggle the host's SMS operational opt-in without re-verifying (phone already verified).
export async function setSmsOptInAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const ctx = await requireSession();
  const optIn = formData.get('optIn') === 'true';
  const supabase = createClient();
  const now = new Date().toISOString();

  // Guard: can only opt into SMS with a verified phone on file.
  if (optIn && !ctx.profile.phone_verified_at) {
    return { error: 'Verify a phone number before enabling SMS alerts.' };
  }
  const { error } = await supabase
    .from('profiles')
    .update({ sms_opt_in: optIn, sms_opt_in_at: optIn ? now : null, updated_at: now })
    .eq('id', ctx.user.id);
  if (error) return { error: 'Could not update your SMS preference.' };

  await audit(supabase, {
    action: 'profile.sms_opt_in_changed',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
    metadata: { sms_opt_in: optIn },
  });
  revalidatePath('/dashboard/profile');
  return { success: optIn ? 'SMS alerts enabled.' : 'SMS alerts turned off.' };
}

// Toggle optional login 2FA (SMS OTP). Requires a verified phone to enable.
export async function toggleTwoFactorAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const ctx = await requireSession();
  const enabled = formData.get('enabled') === 'true';
  if (enabled && !ctx.profile.phone_verified_at) {
    return { error: 'Verify a phone number before turning on two-factor login.' };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ two_factor_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', ctx.user.id);
  if (error) return { error: 'Could not update your two-factor setting.' };

  await audit(supabase, {
    action: 'profile.two_factor_changed',
    actorProfileId: ctx.user.id,
    hostAccountId: ctx.account.id,
    targetType: 'profile',
    targetId: ctx.user.id,
    metadata: { two_factor_enabled: enabled },
  });
  revalidatePath('/dashboard/profile');
  return { success: enabled ? 'Two-factor login is on.' : 'Two-factor login is off.' };
}
