import { requireSession } from '@/lib/auth/guards';
import { visibleProfileSections } from '@/lib/dashboard/profile-nav';
import { ProfileNav } from './ProfileNav';

export const dynamic = 'force-dynamic';

/**
 * Profile settings shell (backlog P6-05).
 *
 * Every section renders inside this layout, so the nav, the heading, and the
 * owner/member visibility rule are decided once. Section pages re-check their own
 * permissions: this layout controls what is offered, not what is allowed.
 */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSession();
  const isOwner = ctx.account.owner_id === ctx.user.id;
  const sections = visibleProfileSections(isOwner);

  return (
    <div>
      <header style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '.25rem' }}>Profile and account</h1>
        <p className="muted" style={{ fontSize: '.9rem', margin: 0 }}>
          {isOwner
            ? 'Everything about you and your account, in one place.'
            : 'Your personal settings. Billing and usage stay with the account owner.'}
        </p>
      </header>

      <div className="profile-shell">
        <ProfileNav sections={sections} />
        <div className="profile-body">{children}</div>
      </div>
    </div>
  );
}
