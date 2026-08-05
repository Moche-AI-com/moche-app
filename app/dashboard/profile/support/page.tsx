import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { SALES_EMAIL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * How to reach a person, plus the identifiers that let us find the account without
 * a round trip asking for them. The mailto is pre-filled with the account id for
 * exactly that reason.
 */
export default async function ProfileSupportPage() {
  const ctx = await requireSession();
  const subject = encodeURIComponent('Moche.AI support request');
  const body = encodeURIComponent(
    [
      'What happened:',
      '',
      'What I expected instead:',
      '',
      '---',
      `Account: ${ctx.account.id}`,
      `Signed in as: ${ctx.profile.email}`,
    ].join('\n'),
  );

  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Support</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 620 }}>
        Email reaches a person. Include what you expected and what happened instead, and we can
        usually resolve it in one reply.
      </p>

      <div className="card" style={{ padding: '1.5rem', maxWidth: 560 }}>
        <a className="btn btn-primary" href={`mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`}>
          Email support
        </a>
        <p className="faint" style={{ fontSize: '.8rem', margin: '.85rem 0 0' }}>
          The draft already includes your account id, so you do not have to look it up.
        </p>

        <dl style={{ margin: '1.25rem 0 0', fontSize: '.85rem' }}>
          <dt className="faint" style={{ fontSize: '.75rem' }}>Account id</dt>
          <dd style={{ margin: '0 0 .75rem', fontFamily: 'ui-monospace, monospace' }}>
            {ctx.account.id}
          </dd>
          <dt className="faint" style={{ fontSize: '.75rem' }}>Signed in as</dt>
          <dd style={{ margin: 0 }}>{ctx.profile.email}</dd>
        </dl>
      </div>

      <div className="card" style={{ padding: '1.5rem', maxWidth: 560, marginTop: '1rem' }}>
        <h3 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '.5rem' }}>Policies</h3>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.88rem', display: 'grid', gap: '.35rem' }}>
          <li><Link href="/legal/support">Support policy and response times</Link></li>
          <li><Link href="/legal/refund">Refund policy</Link></li>
          <li><Link href="/legal/ai-policy">How our AI behaves</Link></li>
          <li><Link href="/legal/security">Security</Link></li>
        </ul>
      </div>
    </section>
  );
}
