import { requireSession } from '@/lib/auth/guards';
import { ProfileForm, DeleteAccountForm } from './ProfileForms';
import { SecurityForms } from './SecurityForms';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const ctx = await requireSession();
  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1.5rem' }}>Profile & account</h1>
      <div style={{ display: 'grid', gap: '2rem' }}>
        <ProfileForm
          email={ctx.profile.email}
          fullName={ctx.profile.full_name ?? ''}
        />
        <SecurityForms
          initialPhone={ctx.profile.phone ?? ''}
          phoneVerified={!!ctx.profile.phone_verified_at}
          smsOptIn={!!ctx.profile.sms_opt_in}
          twoFactorEnabled={!!ctx.profile.two_factor_enabled}
        />
        <div className="card" style={{ padding: '1.5rem', maxWidth: 520 }}>
          <h3 style={{ fontSize: '1.05rem', marginBottom: '.5rem' }}>Export your data</h3>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
            Download a machine-readable (JSON) copy of your account, properties, and
            content, in line with your data-portability rights (GDPR Art. 20). Payment
            card data is held solely by our payment processor and is not included.
          </p>
          <a
            className="btn btn-secondary"
            href="/api/legal/export"
            download
            data-testid="data-export-download"
          >
            Download my data (JSON)
          </a>
        </div>
        <DeleteAccountForm />
      </div>
    </div>
  );
}
