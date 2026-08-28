// The Property Brain page, rebuilt as a single unified surface (§4).
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
//
// Layout order is deliberate: Coverage Map first (orientation + navigation), then the
// score and the question queue (what to do), then the manager (doing it), then intake
// panels.

import { requirePropertyAccess } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { computeBrainHealth } from '@/lib/brain/health';
import { computeReadiness } from '@/lib/brain/readiness';
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
import { BRAIN_SECTIONS, resolveSection, sectionLabel } from '@/lib/brain/taxonomy';
import type { Database } from '@/lib/database.types';
import { CompletenessPanel } from './CompletenessPanel';
import { CoverageMap } from './CoverageMap';
import { ImportProvenancePanel } from './ImportProvenancePanel';
import { BrainManager } from './BrainManager';
import { EnhanceBrainPanel, type EnhanceQuestion } from './EnhanceBrainPanel';
import { IngestPanel } from './IngestPanel';
import { AppliancePanel } from './AppliancePanel';

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
    { data: requirementStatuses },
  ] = await Promise.all([
    supabase
      .from('brain_items')
      .select('id, title, body, category, section, visibility, status, source_type, updated_at, deleted_at')
      .eq('property_id', propertyId)
      .is('deleted_at', null)
      .order('category', { ascending: true })
      .order('updated_at', { ascending: false }),
    // Pending AI drafts count toward readiness: a property whose Brain is full but whose
    // queue is untouched is not actually reviewed.
    supabase.from('proposed_updates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('status', 'pending'),
    supabase.from('property_knowledge_requirement_status').select('requirement_key, status').eq('property_id', propertyId),
  ]);

  // The generated row type predates brain_items.section; narrow it here once rather
  // than casting at each use. (Regenerating database.types makes this precise.)
  type BrainRowsTable = Database['public']['Tables']['brain_items']['Row'];
  type BrainRow = Pick<
    BrainRowsTable,
    'id' | 'title' | 'body' | 'category' | 'visibility' | 'status' | 'source_type' | 'deleted_at'
  > & { section?: string | null };
  const rows = (items ?? []) as unknown as BrainRow[];

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

  const readiness = computeReadiness({
    statuses: (requirementStatuses ?? []).map((item) => ({ requirementKey: item.requirement_key, status: item.status })),
    pendingReviews: pendingReviews ?? 0,
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

  return (
    <div>
      <div className="brain-page-head">
        <div>
          <h1 style={{ fontSize: '1.8rem' }}>Property Brain</h1>
          <p className="faint" style={{ fontSize: '.85rem' }}>
            {readiness.label} · {completeness.pct}% guest-ready · {health.totalItems} items
          </p>
        </div>
      </div>

      {!access.can.editBrain && (
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          You have read-only access to this Brain.
        </div>
      )}

      {/* Orientation + navigation first, full width. The map spins until hovered or
          focused; clicks jump into the manager below (2026-08-28 directive). */}
      <div style={{ marginBottom: '1.25rem' }}>
        <CoverageMap view={coverage} />
      </div>

      <div className="brain-shell">
        <div id="brain-editor" style={{ scrollMarginTop: '1rem' }}>
          <BrainManager
            propertyId={propertyId}
            canEdit={access.can.editBrain}
            sections={sections}
            editItemId={searchParams.edit}
            items={rows.map((i) => ({
              id: i.id,
              title: i.title,
              body: i.body ?? '',
              section: resolveSection({ section: i.section ?? null, category: i.category }),
              visibility: i.visibility,
              status: i.status,
              sourceType: i.source_type,
            }))}
          />
        </div>
        <div className="brain-sidebar">
          <div style={{ marginBottom: '1rem' }}>
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
          </div>
          {access.can.editBrain && (
            <div style={{ marginBottom: '1rem' }}>
              <EnhanceBrainPanel
                propertyId={propertyId}
                questions={enhanceQuestions}
                sections={sections}
              />
            </div>
          )}
          {(importRows ?? []).length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
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
            </div>
          )}
          {access.can.editBrain && <IngestPanel propertyId={propertyId} />}
          {access.can.editBrain && (
            <div style={{ marginTop: '1rem' }}>
              <AppliancePanel propertyId={propertyId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
