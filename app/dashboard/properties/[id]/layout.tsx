import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { computeBrainHealth } from '@/lib/brain/health';
import { propertyWorkspaceSummary } from '@/lib/brain/property-workspace-summary';
import { loadCompleteness } from '@/lib/brain/values';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { STATUS_BADGE } from '@/lib/constants';
import { PropertyStatusControls } from './StatusControls';
import { PropertyWorkspaceNav } from './PropertyWorkspaceNav';

export const dynamic = 'force-dynamic';

export default async function PropertyWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { property, can } = await requirePropertyAccess((await params).id);
  const supabase = createClient();
  // Match Manage Brain's request-scoped, RLS-enforced completeness read. A failed
  // read must never become a reassuring or misleading 0% score.
  const completeness = await loadCompleteness(supabase, property.id);
  const summary = propertyWorkspaceSummary(completeness);

  // The old category check remains a separate, optional server publish gate.
  // Only read it when that gate is enabled; it must not supply the percentage.
  const legacyItems = serverEnv.requireBrainToPublish
    ? await supabase
        .from('brain_items')
        .select('category, status, deleted_at, visibility')
        .eq('property_id', property.id)
    : null;
  if (legacyItems?.error) throw legacyItems.error;
  const legacyBrainReady = legacyItems
    ? computeBrainHealth(legacyItems.data ?? []).canGoLive
    : true;
  const location = [property.city, property.region, property.country].filter(Boolean).join(', ') || 'No location set';

  return (
    <section>
      {/* Wayfinding lives in the workspace breadcrumb rendered by
          PropertyWorkspaceNav (Properties / name / current section) — the
          back-to-properties link that used to sit here duplicated the
          breadcrumb's first crumb. */}

      {/* Slim command strip with the same registry score shown in Manage Brain. */}
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
                canGoLive={legacyBrainReady}
                brainRequired={serverEnv.requireBrainToPublish}
                completenessRequired={serverEnv.requireCompletenessToPublish}
                checklistComplete={summary.checklistComplete}
                checklistDetail={summary.checklistDetail}
              />
            </div>
          )}
        </div>

        <Link
          href={`/dashboard/properties/${property.id}/brain`}
          className="brain-meter"
          aria-label={`Guest-ready ${summary.pct} percent. ${summary.checklistDetail}. Manage Brain.`}
        >
          <span className="brain-meter-top">
            <span className="brain-meter-label">Guest-ready</span>
            <span
              className="brain-meter-score"
              style={{ color: summary.checklistComplete ? 'var(--teal)' : summary.pct >= 40 ? 'var(--iris)' : 'var(--coral)' }}
            >
              {summary.pct}
              <small>%</small>
            </span>
          </span>
          <span className="dash-topic-track brain-meter-track" aria-hidden>
            <span className="dash-topic-fill" style={{ width: `${summary.pct}%` }} />
          </span>
          <span className="brain-meter-cta">Manage Brain →</span>
        </Link>
      </header>

      <div className="property-workspace-main">
        <PropertyWorkspaceNav propertyId={property.id} propertyName={property.display_name} canEditProperty={can.editProperty} canReplyGuests={can.replyGuests} />
        <div style={{ minWidth: 0 }}>{children}</div>
      </div>
    </section>
  );
}
