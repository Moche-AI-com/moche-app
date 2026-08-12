import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { RecommendationsManager } from './RecommendationsManager';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requirePropertyAccess((await params).id);
  const supabase = createClient();

  const { data: recs } = await supabase
    .from('recommendations')
    .select('id, name, category, address, url, distance_note, description, host_note, host_preference, priority_weight, approved, hidden, ai_source, lat, lng, tags, price_level')
    .eq('property_id', (await params).id)
    .is('deleted_at', null)
    .order('approved', { ascending: true })
    .order('name', { ascending: true });

  const p = access.property as typeof access.property & { lat: number | null; lng: number | null };
  const hasAddress = !!(p.address_line1 && p.address_line1.trim());
  const rows = recs ?? [];

  return (
    <div>
      <Link href={`/dashboard/properties/${(await params).id}/local`} className="muted" style={{ fontSize: '.85rem' }}>
        ← Local
      </Link>
      <h1 style={{ marginTop: '.5rem' }}>Your picks</h1>
      <div className="card" style={{ marginBottom: '1rem', fontSize: '.9rem' }}>
        Local is now the single overview for guest-visible places, favorites, discovery, and curation.{' '}
        <Link href={`/dashboard/properties/${(await params).id}/local`}>Open Local →</Link>
      </div>
      <p className="muted" style={{ maxWidth: 640 }}>
        The places you personally send guests to. Approved picks are shared with your concierge, which
        offers your favorites first. Unapproved and hidden picks are never mentioned.{' '}
        <Link href={`/dashboard/properties/${(await params).id}/local`}>See everything guests can be told →</Link>
      </p>
      <RecommendationsManager
        propertyId={(await params).id}
        hasAddress={hasAddress}
        canEdit={access.can.editBrain}
        initialRecs={rows as never}
        propertyLat={typeof p.lat === 'number' ? p.lat : null}
        propertyLng={typeof p.lng === 'number' ? p.lng : null}
      />
    </div>
  );
}
