import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { loadCanonicalPlaces } from '@/lib/local/canonical';
import { validCoordinates } from '@/lib/local/validation';
import { LocalWorkspace } from './LocalWorkspace';

export const dynamic = 'force-dynamic';

export default async function LocalOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePropertyAccess(id);
  const supabase = createClient();
  const places = await loadCanonicalPlaces(supabase, id, [], { includeHidden: true });
  const visible = places.filter((place) => place.status === 'approved');
  const favorites = visible.filter((place) => place.isFavorite);
  const suggestions = places.filter((place) => place.status === 'suggested');
  const hidden = places.filter((place) => place.status === 'hidden');
  const coords = access.property as { lat?: number | null; lng?: number | null };
  const hasCoords = validCoordinates(coords.lat, coords.lng);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Local recommendations</h1>
          <p className="muted" style={{ maxWidth: 640, margin: '.5rem 0 0' }}>
            Give guests a useful local guide. Review new places, add your own tips, and choose what guests can see.
          </p>
        </div>
        <Link className="btn btn-sm" href={`/g/${access.property.slug}/local`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Preview guest guide
        </Link>
      </div>

      <div className="card" style={{ margin: '1.25rem 0', display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem' }}>
        <div><div className="faint" style={{ fontSize: '.75rem' }}>Visible to guests</div><div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{visible.length}</div></div>
        <div><div className="faint" style={{ fontSize: '.75rem' }}>Host favorites</div><div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{favorites.length}</div></div>
        <div><div className="faint" style={{ fontSize: '.75rem' }}>Needs review</div><div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{suggestions.length}</div></div>
        <div><div className="faint" style={{ fontSize: '.75rem' }}>Hidden</div><div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{hidden.length}</div></div>
      </div>

      {!hasCoords && (
        <p className="muted" role="status" style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <MapPin size={16} aria-hidden /> Set the property address in Configuration to enable the map. You can still add places manually.
        </p>
      )}
      {visible.length === 0 && suggestions.length > 0 && (
        <p className="muted" role="status">Review a few nearby suggestions below to start your guest guide. Suggestions are not visible to guests until approved.</p>
      )}
      <LocalWorkspace propertyId={id} places={places} canEdit={access.can.editBrain} center={hasCoords ? { lat: coords.lat as number, lng: coords.lng as number } : null} />
    </div>
  );
}
