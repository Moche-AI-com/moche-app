import { requireSession } from '@/lib/auth/guards';
import { SecurityForms } from '../SecurityForms';

export const dynamic = 'force-dynamic';

export default async function ProfileSecurityPage() {
  const ctx = await requireSession();
  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Security and sign-in</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 560 }}>
        A verified phone is what lets us reach you about an escalation, and it is also your
        second factor if you turn two-factor authentication on.
      </p>
      <SecurityForms
        initialPhone={ctx.profile.phone ?? ''}
        phoneVerified={!!ctx.profile.phone_verified_at}
        smsOptIn={!!ctx.profile.sms_opt_in}
        twoFactorEnabled={!!ctx.profile.two_factor_enabled}
      />
    </section>
  );
}
