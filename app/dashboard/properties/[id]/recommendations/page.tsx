import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { RecommendationsManager } from './RecommendationsManager';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({ params }: { params: { id: string } }) {
  const access = await requirePropertyAccess(params.id);
  const supabase = createClient();

  const { data: recs } = await supabase
    .from('recommendations')
    .select('id, name, category, address, url, distance_note, description, host_note, host_preference, priority_weight, approved, hidden, ai_source')
    .eq('property_id', params.id)
    .is('deleted_at', null)
    .order('approved', { ascending: true })
    .order('name', { ascending: true });

  const p = access.property;
  const hasAddress = !!(p.address_line1 && p.address_line1.trim());
  const rows = recs ?? [];

  return (
    <div>
      <Link href={`/dashboard/properties/${params.id}/brain`} className="muted" style={{ fontSize: '.85rem' }}>
        ← Brain
      </Link>
      <h1 style={{ marginTop: '.5rem' }}>Local recommendations</h1>
      <p className="muted" style={{ maxWidth: 640 }}>
        Find nearby places automatically, then curate what your guests see. Approved places (and your
        favorites first) are shared with the concierge. Hidden places are never shown.
      </p>
      <RecommendationsManager
        propertyId={params.id}
        hasAddress={hasAddress}
        canEdit={access.can.editBrain}
        initialRecs={rows as never}
      />
    </div>
  );
}
