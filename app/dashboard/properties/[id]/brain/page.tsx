// The Property Brain page — full-width single-flow layout (redesign layout pass,
// 2026-08-31).
//
// What was removed and why:
//   - BrainGraph and BrainCards. Three editing entry points (graph node -> ?edit=,
//     card -> ?card= filter, manager form) meant the same knowledge could be reached
//     three ways, each with different defaults, and the card filter silently hid items
//     from the list. One manager, one taxonomy.
//   - The second "Coverage" card in the sidebar, which rendered brain-health categories
//     under the same heading as the real Coverage Map with a different denominator. Two
//     numbers called "coverage" on one page is worse than either alone.
//   - "Manage local recommendations ->". Local Recs is its own tab (§4, §5).
//   - "Next questions", replaced by Enhance Brain, which asks and files (§7).
//   - The brain_items.section probe and its lossy fallback (2026-08-28). The
//     BRAIN-SECTIONS migration (20260823141718_brain_sections) is applied in production,
//     so the column always exists: the manager offers the full taxonomy and every save
//     round-trips its section. Also removed: an unused property_settings query whose
//     only selected column (confidence_threshold) was never read on this page.
//   - The Appliance helper card and the legacy readiness engine (2026-08-31).
//     Appliance management lives on the dedicated Appliances page (verified
//     inventory + manual sections) — the helper card duplicated it. And the header
//     rendered two readiness notions: the legacy 8-category label AND the registry
//     completeness score the publish gate reads. The canonical number wins, and
//     pending AI reviews now surface as their own count.
//   - The sidebar IngestPanel and the main-column FeaturesPanel (2026-08-31, redesign
//     consolidation). Both now live one click away as full surfaces: /brain/add is the
//     single intake for writing, files, URLs, and paste; /brain/spaces is the single
//     place to declare what the property has and manage custom sections. Keeping both
//     panels here meant two competing intake paths and two competing feature lists on
//     one page.
//   - The editor + sidebar two-column shell (this pass). The sidebar squeezed the
//     editor and stranded the support cards on wide screens; on phones it stacked in
//     an order nobody chose. The page is now one flow: a status strip (go-live verdict
//     + the three headline numbers), the Coverage Map for orientation, the Brain
//     Manager full width, then the support cards in a responsive grid. Enhance Brain
//     needed no change — it already opens closed behind its Start button.
//
// Layout order is deliberate: status strip (can this go live), Coverage Map
// (orientation + navigation), the manager (the doing surface), then support.

import Link from 'next/link';
import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth } from '@/lib/brain/health';
import {
  APPLICABILITY_LABELS,
  APPLICABILITY_PREDICATES,
  COMPLETENESS_SHIP_THRESHOLD,
  domainLabel,
  fieldsGatedBy,
} from '@/lib/brain/completeness';
import { loadCompleteness } from '@/lib/brain/values';
import { serverEnv } from '@/lib/env';
import { buildCoverageMap } from '@/lib/brain/coverage';
import { BRAIN_SECTIONS, resolveSection, sectionLabel, type PropertyFeature } from '@/lib/brain/taxonomy';
import type { Database } from '@/lib/database.types';
import { CompletenessPanel } from './CompletenessPanel';
import { CoverageMap } from './CoverageMap';
import { ImportProvenancePanel } from './ImportProvenancePanel';
import { BrainManager } from './BrainManager';
import { EnhanceBrainPanel, type EnhanceQuestion } from './EnhanceBrainPanel';
import layout from './brain-layout.module.css';

export const dynamic = 'force-dynamic';

export default async function BrainPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: { edit?: string };
}) {
  const propertyId = (await params).id;
  const access = await requirePropertyAccess(propertyId);
  const supabase = createClient();

  const [
    { data: items },
    { count: pendingReviews },
    { data: featureRows },
  ] = await Promise.all([
    supabase
      .from('brain_items')
      .select('id, title, body, category, section, feature_id, visibility, status, source_type, updated_at, deleted_at')
      .eq('property_id', propertyId)
      .is('deleted_at', null)
      .order('category', { ascending: true })
      .order('updated_at', { ascending: false }),
    // Pending AI drafts surface in the header: a property whose Brain is full but
    // whose queue is untouched is not actually reviewed.
    supabase.from('proposed_updates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('status', 'pending'),
    // Active (non-archived) features: the property's custom sections.
    supabase
      .from('property_features')
      .select('id, label, catalog_key, location, guest_access, notes, created_via')
      .eq('property_id', propertyId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
  ]);

  // The generated row type predates brain_items.section/feature_id; narrow it here
  // once rather than casting at each use. (Regenerating database.types makes this
  // precise.)
  type BrainRowsTable = Database['public']['Tables']['brain_items']['Row'];
  type BrainRow = Pick<
    BrainRowsTable,
    'id' | 'title' | 'body' | 'category' | 'visibility' | 'status' | 'source_type' | 'deleted_at'
  > & { section?: string | null; feature_id?: string | null };
  const rows = (items ?? []) as unknown as BrainRow[];

  const features: PropertyFeature[] = (featureRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    catalogKey: f.catalog_key,
    location: f.location,
    guestAccess: f.guest_access as PropertyFeature['guestAccess'],
    notes: f.notes,
    createdVia: f.created_via as PropertyFeature['createdVia'],
  }));

  const health = computeBrainHealth(
    rows.map((i) => ({
      category: i.category,
      status: i.status,
      deleted_at: i.deleted_at,
      visibility: i.visibility,
    })),
  );

  // Registry completeness, the number the publish gate reads. Loaded with the
  // request-scoped client so RLS applies: a co-host who cannot see the property cannot
  // see its score either.
  const completeness = await loadCompleteness(supabase, propertyId);
  const { data: predicateRows } = await supabase
    .from('property_applicability')
    .select('predicate, applies')
    .eq('property_id', propertyId);
  const predicateAnswers = new Map((predicateRows ?? []).map((r) => [r.predicate, r.applies]));

  // Import provenance: source URL, fetch time, and the attestation the host gave.
  // security invoker RPC, so a caller who cannot see the jobs gets no rows.
  const { data: importRows } = await supabase.rpc('property_import_provenance', {
    p_property_id: propertyId,
  });

  // The full 10-section taxonomy. brain_items.section exists in production, so every
  // section round-trips: what the host files under is what they read back.
  const sections = BRAIN_SECTIONS.map((s) => ({ value: s.id, label: s.label, blurb: s.blurb }));

  // Enhance Brain queue: heaviest gaps first, blocking ones promoted client-side. Each
  // gap already names its registry domain, which is also its section id, so placement is
  // derived rather than guessed.
  const enhanceQuestions: EnhanceQuestion[] = [...completeness.gaps]
    .sort((a, b) => b.gapWeight - a.gapWeight)
    .slice(0, 12)
    .map((g) => ({
      fieldId: g.fieldId,
      label: g.label,
      prompt: g.interviewPrompt || `What should guests know about ${g.label.toLowerCase()}?`,
      section: sections.some((s) => s.value === g.domain) ? g.domain : 'space_details',
      sectionLabel: sectionLabel(g.domain),
      hardBlock: g.hardBlock,
    }));

  const coverage = buildCoverageMap({
    statuses: completeness.statuses,
    applicable: completeness.applicable,
    domains: completeness.domains,
  });

  const reviewCount = pendingReviews ?? 0;
  const ready = completeness.canPublish;
  const mustHaveMissing = completeness.hardBlocksOutstanding.length;

  return (
    <div>
      <div className="brain-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Property Brain</h1>
          <p className="faint" style={{ fontSize: '.85rem' }}>
            Everything your concierge knows about this place — and what is still missing.
          </p>
        </div>
        <nav style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-primary btn-sm" href={`/dashboard/properties/${propertyId}/brain/add`}>
            + Add knowledge
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/dashboard/properties/${propertyId}/brain/spaces`}>
            Spaces &amp; features
          </Link>
          <Link className="btn btn-ghost btn-sm" href={`/dashboard/properties/${propertyId}/brain/go-live`}>
            Go-live readiness
          </Link>
        </nav>
      </div>

      {!access.can.editBrain && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          You have read-only access to this Brain.
        </div>
      )}

      {/* Status strip: the go-live verdict (the publish gate's own answer, so it cannot
          disagree with enforcement) plus the three numbers a host scans for. */}
      <div
        className={`${layout.attention} ${ready ? layout.attentionReady : ''}`}
        style={{ marginTop: '1.25rem' }}
        data-ready={ready}
        data-testid="brain-golive-banner"
      >
        <div className={layout.attentionBody}>
          <span className={layout.attentionTitle}>
            {ready ? 'Ready to publish' : 'Not ready to publish'}
          </span>
          <span className={layout.attentionSub}>
            {ready
              ? 'Every must-have answer is in and the score clears the publish line.'
              : mustHaveMissing > 0
                ? `${mustHaveMissing} must-have ${mustHaveMissing === 1 ? 'answer' : 'answers'} still missing.`
                : `The score needs ${COMPLETENESS_SHIP_THRESHOLD}% to publish.`}
          </span>
        </div>
        <Link
          className={`btn btn-ghost btn-sm ${layout.attentionCta}`}
          href={`/dashboard/properties/${propertyId}/brain/go-live`}
        >
          Go-live checklist
        </Link>
      </div>

      <div className={layout.stats} data-testid="brain-stats">
        <div className={layout.stat}>
          <span className={layout.statValue}>{completeness.pct}%</span>
          <span className={layout.statLabel}>guest-ready</span>
        </div>
        <div className={layout.stat}>
          <span className={layout.statValue}>{health.totalItems}</span>
          <span className={layout.statLabel}>answers filed</span>
        </div>
        <div className={`${layout.stat}${reviewCount > 0 ? ` ${layout.statAttention}` : ''}`}>
          <span className={layout.statValue}>{reviewCount}</span>
          <span className={layout.statLabel}>to review</span>
        </div>
      </div>

      {/* Orientation + navigation: the map spins until hovered or focused; clicks jump
          into the manager below (2026-08-28 directive). */}
      <div style={{ marginTop: '1.25rem' }}>
        <CoverageMap view={coverage} />
      </div>

      {/* The doing surface gets the full width. */}
      <div id="brain-editor" style={{ scrollMarginTop: '1rem', marginTop: '1.25rem' }}>
        <BrainManager
          propertyId={propertyId}
          canEdit={access.can.editBrain}
          sections={sections}
          features={features}
          editItemId={searchParams.edit}
          items={rows.map((i) => ({
            id: i.id,
            title: i.title,
            body: i.body ?? '',
            section: resolveSection({ section: i.section ?? null, category: i.category }),
            featureId: i.feature_id ?? null,
            visibility: i.visibility,
            status: i.status,
            sourceType: i.source_type,
          }))}
        />
      </div>

      {/* Support cards: two across on wide screens, one column on phones. Enhance first
          — answering the queue is how the strip numbers move. */}
      <div className={layout.supportGrid}>
        {access.can.editBrain && (
          <EnhanceBrainPanel
            propertyId={propertyId}
            questions={enhanceQuestions}
            sections={sections}
          />
        )}
        <CompletenessPanel
          propertyId={propertyId}
          canEdit={access.can.editBrain}
          pct={completeness.pct}
          threshold={COMPLETENESS_SHIP_THRESHOLD}
          numerator={completeness.numerator}
          denominator={completeness.denominator}
          canPublish={completeness.canPublish}
          blockedReason={completeness.blockedReason}
          enforced={serverEnv.requireCompletenessToPublish}
          domains={completeness.domains.map((d) => ({
            domain: d.domain,
            label: domainLabel(d.domain),
            pct: d.pct,
            weight: d.weight,
            gapCount: d.gaps.length,
          }))}
          hardBlocks={completeness.hardBlocksOutstanding.map((g) => ({
            fieldId: g.fieldId,
            label: g.label,
            domain: g.domain,
            status: g.status,
            hardBlock: g.hardBlock,
            interviewPrompt: g.interviewPrompt,
          }))}
          predicates={APPLICABILITY_PREDICATES.map((p) => ({
            predicate: p,
            label: APPLICABILITY_LABELS[p] ?? p.replace(/_/g, ' '),
            applies: predicateAnswers.has(p) ? !!predicateAnswers.get(p) : null,
            fieldCount: fieldsGatedBy(p).length,
          }))}
        />
        {(importRows ?? []).length > 0 && (
          <ImportProvenancePanel
            propertyId={propertyId}
            canEdit={access.can.editBrain}
            imports={(importRows ?? []).map((row) => ({
              jobId: row.job_id,
              sourceUrl: row.source_url,
              provider: row.provider,
              fetchedAt: row.fetched_at,
              status: row.status,
              attestedAt: row.ownership_attested_at,
              attestationText: row.attestation_text,
              artifactCount: Number(row.artifact_count ?? 0),
            }))}
          />
        )}
      </div>
    </div>
  );
}
