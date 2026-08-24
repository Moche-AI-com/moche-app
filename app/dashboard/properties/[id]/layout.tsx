import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { computeBrainHealth } from '@/lib/brain/health';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { STATUS_BADGE } from '@/lib/constants';
import { PropertyStatusControls } from './StatusControls';
import { PropertyWorkspaceNav } from './PropertyWorkspaceNav';

export default async function PropertyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { property, can } = await requirePropertyAccess((await params).id);
  const supabase = createClient();
  const { data: items } = await supabase
    .from('brain_items')
    .select('category, status, deleted_at, visibility')
    .eq('property_id', property.id);
  const health = computeBrainHealth(items ?? []);
  const location = [property.city, property.region, property.country].filter(Boolean).join(', ') || 'No location set';

  return (
    <section>
      <Link
        href="/dashboard/properties"
        className="muted"
        style={{ display: 'inline-flex', alignItems: 'center', minHeight: '2.75rem', fontSize: '.88rem', textDecoration: 'none' }}
      >
        ← All properties
      </Link>

      {/* Grid styles live in globals.css (.property-workspace-header /
          .property-workspace-main) — class-driven so the 860px mobile collapse
          actually applies. Inline grid styles would override it. */}
      <header className="card property-workspace-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.55rem', margin: 0 }}>{property.display_name}</h1>
            <span className={`badge ${STATUS_BADGE[property.status] ?? ''}`}>{property.status}</span>
          </div>
          <p className="faint" style={{ fontSize: '.84rem', margin: '.35rem 0 0' }}>
            {location} · {property.timezone}
          </p>
          {can.editProperty && (
            <div style={{ marginTop: '.85rem' }}>
              <PropertyStatusControls
                propertyId={property.id}
                status={property.status}
                canGoLive={health.canGoLive}
                brainRequired={serverEnv.requireBrainToPublish}
              />
            </div>
          )}
        </div>

        <div className="card-2" style={{ padding: '.8rem .9rem', alignSelf: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem' }}>
            <div>
              <div className="faint" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Brain health</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.35rem', marginTop: '.1rem' }}>
                <strong style={{ fontSize: '1.35rem', color: health.score >= 70 ? 'var(--teal)' : health.score >= 40 ? 'var(--iris)' : 'var(--coral)' }}>{health.score}</strong>
                <span className="muted" style={{ fontSize: '.8rem' }}>/100</span>
              </div>
            </div>
            <Link href={`/dashboard/properties/${property.id}/brain`} className="btn btn-sm btn-ghost" style={{ minHeight: '2.75rem' }}>
              Manage Brain
            </Link>
          </div>
        </div>
      </header>

      <div className="property-workspace-main">
        <PropertyWorkspaceNav propertyId={property.id} propertyName={property.display_name} canEditProperty={can.editProperty} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </section>
  );
}
