import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { canCreateProperty } from '@/lib/billing/entitlements';
import { PropertyCreateForm } from './PropertyCreateForm';
import { ListingImportForm } from './ListingImportForm';
import { PropertyWizard } from './PropertyWizard';

export const dynamic = 'force-dynamic';

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string; intent?: string }>;
}) {
  const { manual } = await searchParams;
  const ctx = await requireSession();
  const supabase = createClient();
  const gate = await canCreateProperty(supabase, ctx.account.id);
  if (!gate.ok) redirect('/dashboard/profile/billing?reason=limit');

  // `?manual=1` is the destination the low-confidence listing fallback links to. A
  // host who has just been told we could not read their link should land on the
  // guided interview itself, not on a page where they have to find it — so the
  // wizard replaces the listing form rather than sitting under a disclosure.
  if (manual === '1') {
    return (
      <div>
        <p className="faint" style={{ marginBottom: '.25rem' }}>Add a property</p>
        <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1rem' }}>Let&apos;s set it up together</h1>
        <p className="faint" style={{ maxWidth: '62ch', marginBottom: '1.25rem' }}>
          A few short steps. We only ask about things your place actually has, and everything is saved as you go.
        </p>
        <PropertyWizard defaultTimezone="UTC" />
      </div>
    );
  }

  return (
    <div>
      <p className="faint" style={{ marginBottom: '.25rem' }}>Step 1 of 2</p>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1rem' }}>Start with your listing</h1>
      <ListingImportForm />
      {/* The guided interview is the better manual path and is linked first. The old
          single-form create stays available underneath it: it is the fastest route for
          a host who only wants the property row and will fill the Brain in later, and
          removing it would make that a multi-step job. */}
      <div style={{ marginTop: '1.25rem', maxWidth: 680 }}>
        <Link className="btn btn-ghost" href="/dashboard/properties/new?manual=1">
          Set it up step by step instead
        </Link>
      </div>
      <details id="manual-setup" style={{ marginTop: '1rem', maxWidth: 680 }}>
        <summary style={{ cursor: 'pointer' }}>Just create the property, I&apos;ll add details later</summary>
        <div style={{ marginTop: '1rem' }}>
          <PropertyCreateForm />
        </div>
      </details>
    </div>
  );
}
