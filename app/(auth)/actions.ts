'use server';

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { signupSchema, loginSchema, resetRequestSchema, resetUpdateSchema, hostLoginOtpSchema } from '@/lib/validation';
import { hasServiceRole } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession } from '@/lib/auth/guards';
import { recordAcceptances } from '@/lib/legal/acceptance';
import { createUserAndSendConfirmation, sendPasswordReset } from '@/lib/auth/auth-email';
import { createAndSendHostOtp, verifyHostOtp } from '@/lib/auth/host-otp';
import { verifyTrustedDeviceValue, signTrustedDeviceValue } from '@/lib/crypto';
import { TRUSTED_DEVICE_COOKIE, TRUSTED_DEVICE_TTL_DAYS } from '@/lib/constants';
import { log } from '@/lib/log';

function safeNext(raw: FormDataEntryValue | null): string {
  const next = typeof raw === 'string' ? raw : '';
  return next.startsWith('/') ? next : '/dashboard';
}

function trustedDeviceCookieOptions() {
  return {
    name: TRUSTED_DEVICE_COOKIE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: TRUSTED_DEVICE_TTL_DAYS * 24 * 60 * 60,
  };
}

export interface FormState {
  error?: string;
  success?: string;
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    accountName: formData.get('accountName') || undefined,
    acceptTerms: formData.get('acceptTerms') === 'on',
    smsOptIn: formData.get('smsOptIn') === 'on',
    phone: formData.get('phone') || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check your details.' };
  }
  const { email, password, fullName, accountName, smsOptIn, phone } = parsed.data;

  // Account creation + confirmation email both require the service-role client
  // (Supabase's built-in SMTP sender is disabled in favour of our Resend transport).
  if (!hasServiceRole()) {
    log.error('signup_no_service_role', {});
    return { error: 'Account signup is temporarily unavailable. Please try again shortly.' };
  }
  const admin = createAdminClient();

  // Creates the (unconfirmed) auth user via admin.generateLink and emails the
  // confirmation link through Resend. Returns a friendly message on any failure —
  // this path must NEVER surface a raw/stringified error object to the UI.
  const result = await createUserAndSendConfirmation(admin, {
    email,
    password,
    data: { full_name: fullName, account_name: accountName ?? `${fullName}'s properties` },
  });

  if (!result.ok) {
    // Map known reasons to friendly copy; default to a generic retry message so
    // an empty/opaque error can never render as "{}".
    const reason = result.reason.toLowerCase();
    if (reason.includes('already') && reason.includes('regist')) {
      return { error: 'An account with this email already exists. Try signing in instead.' };
    }
    if (reason.includes('email') || reason.includes('send')) {
      return { error: 'We couldn\u2019t send your confirmation email just now. Please try again in a moment.' };
    }
    return { error: 'We couldn\u2019t create your account just now. Please try again shortly.' };
  }

  // Persist consent + acceptances (best-effort — never block a successful signup).
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = h.get('user-agent');

  // A2P 10DLC: record explicit SMS/WhatsApp opt-in only when actively given.
  // The number is stored unverified — sending is still gated on the phone
  // verification step in Dashboard -> Settings.
  if (smsOptIn) {
    const { error: consentError } = await admin
      .from('profiles')
      .update({
        sms_opt_in: true,
        sms_opt_in_at: new Date().toISOString(),
        ...(phone ? { phone } : {}),
      })
      .eq('id', result.userId);
    if (consentError) log.warn('sms_opt_in_persist_failed', { reason: consentError.message });
  }

  await recordAcceptances(admin, { userId: result.userId, context: 'signup', ip, userAgent });

  redirect('/verify-email');
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Enter a valid email and password.' };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { error: 'Invalid email or password.' };
  }
  const next = safeNext(formData.get('next'));

  // Optional SMS 2FA: only for hosts who verified a phone AND enabled the toggle.
  // A valid trusted-device cookie skips the step. This never touches guest auth.
  const { data: profile } = await supabase
    .from('profiles')
    .select('phone, phone_verified_at, two_factor_enabled')
    .eq('id', data.user.id)
    .single();

  const needs2fa =
    !!profile?.two_factor_enabled && !!profile.phone_verified_at && !!profile.phone;
  if (needs2fa) {
    const trusted = verifyTrustedDeviceValue(data.user.id, (await cookies()).get(TRUSTED_DEVICE_COOKIE)?.value);
    if (!trusted && hasServiceRole()) {
      await createAndSendHostOtp(createAdminClient(), {
        userId: data.user.id,
        phone: profile!.phone!,
        purpose: 'login',
      });
      redirect(`/login/verify?next=${encodeURIComponent(next)}`);
    }
  }

  redirect(next);
}

// Step two of login 2FA: verify the SMS code, then trust this device so the user
// is not challenged again for TRUSTED_DEVICE_TTL_DAYS. Requires an active session
// (created by the password step) — this does not bypass password auth.
export async function verifyLoginOtpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireSession();
  const parsed = hostLoginOtpSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { error: 'Enter the 6-digit code we texted you.' };
  if (!hasServiceRole()) return { error: 'Two-factor login is unavailable right now.' };

  const ok = await verifyHostOtp(createAdminClient(), {
    userId: ctx.user.id,
    purpose: 'login',
    code: parsed.data.code,
  });
  if (!ok) return { error: 'That code is invalid or has expired. Request a new one.' };

  (await cookies()).set({
    ...trustedDeviceCookieOptions(),
    value: signTrustedDeviceValue(ctx.user.id),
  });
  redirect(safeNext(formData.get('next')));
}

// Resend a fresh login OTP (rate-limited inside createAndSendHostOtp).
export async function resendLoginOtpAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  const ctx = await requireSession();
  if (!ctx.profile.phone || !ctx.profile.phone_verified_at) {
    return { error: 'No verified phone on file.' };
  }
  if (!hasServiceRole()) return { error: 'Two-factor login is unavailable right now.' };
  const res = await createAndSendHostOtp(createAdminClient(), {
    userId: ctx.user.id,
    phone: ctx.profile.phone,
    purpose: 'login',
  });
  if (!res.ok) {
    return { error: res.rateLimited ? 'Too many code requests. Try again later.' : 'Could not send a new code.' };
  }
  return { success: 'A new code is on its way.' };
}

export async function logoutAction(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resetRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: 'Enter a valid email address.' };
  // Send the recovery link via our Resend transport (Supabase built-in SMTP is
  // disabled). Silently no-ops for unknown emails to avoid account enumeration.
  if (hasServiceRole()) {
    await sendPasswordReset(createAdminClient(), { email: parsed.data.email, next: '/reset/update' });
  }
  // Identical response regardless of whether the email exists.
  return { success: 'If an account exists for that email, a reset link is on its way.' };
}

export async function resetUpdateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetUpdateSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid password.' };
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  redirect('/dashboard');
}
