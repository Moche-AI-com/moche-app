import { requireSession } from '@/lib/auth/guards';
import { ProfileForm, DeleteAccountForm } from './ProfileForms';

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
          phone={ctx.profile.phone ?? ''}
        />
        <DeleteAccountForm />
      </div>
    </div>
  );
}
