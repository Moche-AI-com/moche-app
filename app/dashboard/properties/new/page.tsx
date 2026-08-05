import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { canCreateProperty } from '@/lib/billing/entitlements';
import { PropertyCreateForm } from './PropertyCreateForm';

export const dynamic = 'force-dynamic';

export default async function NewPropertyPage() {
  const ctx = await requireSession();
  const supabase = createClient();
  const gate = await canCreateProperty(supabase, ctx.account.id);
  if (!gate.ok) redirect('/dashboard/billing?reason=limit');

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', margin: '.5rem 0 1.5rem' }}>New property</h1>
      <PropertyCreateForm />
    </div>
  );
}
