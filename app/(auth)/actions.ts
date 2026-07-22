'use server';

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { signupSchema, loginSchema, resetRequestSchema, resetUpdateSchema, hostLoginOtpSchema } from '@/lib/validation';
import { publicEnv, hasServiceRole } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession } from '@/lib/auth/guards';
import { recordAcceptances } from '@/lib/legal/acceptance';
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Please check your details.' };
  }
  const { email, password, fullName, accountName } = parsed.data;
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${publicEnv.appUrl}/auth/callback`,
      // The handle_new_user trigger reads these into profiles/host_accounts.
      data: { full_name: fullName, account_name: accountName ?? `${fullName}'s properties` },
    },
  });
  if (error) {
    log.warn('signup_failed', { reason: error.message });
    return { error: error.message };
  }

  // Record the clickwrap consent (Terms + Privacy) as an auditable acceptance row.
  // The user has no active session yet (email verification pending), so use the
  // service-role client. Best-effort — never block signup if logging fails.
  if (data.user && hasServiceRole()) {
    const h = headers();
    await recordAcceptances(createAdminClient(), {
      userId: data.user.id,
      context: 'signup',
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: h.get('user-agent'),
    });
  }

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
    const trusted = verifyTrustedDeviceValue(data.user.id, cookies().get(TRUSTED_DEVICE_COOKIE)?.value);
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

  cookies().set({
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
  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset/update`,
  });
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
