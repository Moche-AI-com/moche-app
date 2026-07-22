import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { hasServiceRole } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasActiveHostOtp, createAndSendHostOtp } from '@/lib/auth/host-otp';
import { LoginOtpForm } from './LoginOtpForm';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith('/') ? raw : '/dashboard';
}

export default async function LoginVerifyPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const ctx = await requireSession();
  const next = safeNext(searchParams.next);

  // If the user never enabled 2FA (or has no verified phone), there is nothing to
  // challenge — send them straight on.
  if (!ctx.profile.two_factor_enabled || !ctx.profile.phone_verified_at || !ctx.profile.phone) {
    redirect(next);
  }

  // Make sure a live challenge exists (e.g. on a direct visit or refresh). Best-effort.
  if (hasServiceRole()) {
    const admin = createAdminClient();
    const active = await hasActiveHostOtp(admin, ctx.user.id, 'login');
    if (!active) {
      await createAndSendHostOtp(admin, { userId: ctx.user.id, phone: ctx.profile.phone, purpose: 'login' });
    }
  }

  const last4 = ctx.profile.phone.replace(/[^\d]/g, '').slice(-4);
  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '.4rem' }}>Verify it&apos;s you</h1>
      <p className="muted" style={{ marginBottom: '1.5rem', fontSize: '.9rem' }}>
        We texted a 6-digit code to your phone ending in {last4}. Enter it to finish signing in.
      </p>
      <LoginOtpForm next={next} />
    </>
  );
}
