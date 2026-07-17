'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signupSchema, loginSchema, resetRequestSchema, resetUpdateSchema } from '@/lib/validation';
import { publicEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { getPostHogClient } from '@/lib/posthog-server';

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
  const { data: signUpData, error } = await supabase.auth.signUp({
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
  const posthog = getPostHogClient();
  const newUserId = signUpData.user?.id ?? email;
  posthog.identify({ distinctId: newUserId, properties: { name: fullName } });
  posthog.capture({ distinctId: newUserId, event: 'user_signed_up', properties: { has_account_name: !!accountName } });
  await posthog.flush();
  redirect('/verify-email');
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Enter a valid email and password.' };

  const supabase = createClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: 'Invalid email or password.' };
  }
  const posthog = getPostHogClient();
  const userId = signInData.user?.id;
  if (userId) {
    posthog.capture({ distinctId: userId, event: 'user_logged_in', properties: { source: 'password' } });
    await posthog.flush();
  }
  const next = (formData.get('next') as string) || '/dashboard';
  redirect(next.startsWith('/') ? next : '/dashboard');
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
