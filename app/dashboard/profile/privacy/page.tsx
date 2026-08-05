import Link from 'next/link';
import { DeleteAccountForm } from '../ProfileForms';

export const dynamic = 'force-dynamic';

export default function ProfilePrivacyPage() {
  return (
    <section>
      <h2 style={{ fontSize: '1.15rem', marginTop: 0 }}>Data and privacy</h2>
      <p className="muted" style={{ fontSize: '.88rem', maxWidth: 620 }}>
        Your data is yours. Take a copy any time, and close the account whenever you want.
      </p>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem', maxWidth: 560 }}>
          <h3 style={{ fontSize: '1.05rem', marginBottom: '.5rem' }}>Export your data</h3>
          <p className="muted" style={{ fontSize: '.85rem', marginBottom: '1rem' }}>
            Download a machine-readable (JSON) copy of your account, properties, and content, in
            line with your data-portability rights (GDPR Art. 20). Payment card data is held
            solely by our payment processor and is not included.
          </p>
          <a
            className="btn btn-secondary"
            href="/api/legal/export"
            download
            data-testid="data-export-download"
          >
            Download my data (JSON)
          </a>
          <p className="faint" style={{ fontSize: '.78rem', marginTop: '.85rem', marginBottom: 0 }}>
            What we collect and why is set out in the{' '}
            <Link href="/legal/privacy">Privacy Policy</Link>, and our subprocessors are listed{' '}
            <Link href="/legal/subprocessors">here</Link>.
          </p>
        </div>

        <DeleteAccountForm />
      </div>
    </section>
  );
}
