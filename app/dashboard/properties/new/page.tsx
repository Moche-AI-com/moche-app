import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { canCreateProperty } from '@/lib/billing/entitlements';
import { PropertyCreateForm } from './PropertyCreateForm';
import { ListingImportForm } from './ListingImportForm';

export const dynamic = 'force-dynamic';

export default async function NewPropertyPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const gate = await canCreateProperty(supabase, ctx.account.id);
  if (!gate.ok) redirect('/dashboard/profile/billing?reason=limit');

  return (
    <div>
      <p className="faint" style={{ marginBottom: '.25rem' }}>Step 1 of 2</p>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1rem' }}>Start with your listing</h1>
      <ListingImportForm />
      <details style={{ marginTop: '1.25rem', maxWidth: 680 }}>
        <summary style={{ cursor: 'pointer' }}>Set up manually instead</summary>
        <div style={{ marginTop: '1rem' }}><PropertyCreateForm /></div>
      </details>
    </div>
  );
}
