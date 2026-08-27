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
      {/* Wayfinding lives in the workspace breadcrumb rendered by
          PropertyWorkspaceNav (Properties / name / current section) — the
          back-to-properties link that used to sit here duplicated the
          breadcrumb's first crumb. */}

      {/* Slim command strip, not a hero card: identity + status actions on the
          left, Brain health as a compact meter on the right. Grid rules live in
          globals.css (.property-workspace-header) so the 860px collapse applies. */}
      <header className="property-workspace-header">
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

        {/* The whole meter is the Manage Brain link — the gradient bar carries
            the score at a glance, so the number never needs its own card. */}
        <Link
          href={`/dashboard/properties/${property.id}/brain`}
          className="brain-meter"
          aria-label={`Brain health ${health.score} out of 100. Manage Brain.`}
        >
          <span className="brain-meter-top">
            <span className="brain-meter-label">Brain health</span>
            <span
              className="brain-meter-score"
              style={{ color: health.score >= 70 ? 'var(--teal)' : health.score >= 40 ? 'var(--iris)' : 'var(--coral)' }}
            >
              {health.score}
              <small>/100</small>
            </span>
          </span>
          <span className="dash-topic-track brain-meter-track" aria-hidden>
            <span className="dash-topic-fill" style={{ width: `${health.score}%` }} />
          </span>
          <span className="brain-meter-cta">Manage Brain →</span>
        </Link>
      </header>

      <div className="property-workspace-main">
        <PropertyWorkspaceNav propertyId={property.id} propertyName={property.display_name} canEditProperty={can.editProperty} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </section>
  );
}
