import { requireSession } from '@/lib/auth/guards';
import { ProfileForm } from '../ProfileForms';

export const dynamic = 'force-dynamic';

export default async function ProfileDetailsPage() {
  const ctx = await requireSession();
  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Personal details</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 560 }}>
        Your name is what guests see when your concierge hands a conversation to a person.
      </p>
      <ProfileForm email={ctx.profile.email} fullName={ctx.profile.full_name ?? ''} />
    </section>
  );
}
