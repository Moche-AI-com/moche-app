import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { redactCredentials } from '@/lib/brain/redact';
import { requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';
import { catalogAnswerDrafts, type CatalogKnowledgeCandidate } from './catalog-answer-drafts';

export type StagingResult = { manualSections: number; answerDrafts: number; error?: string };
const normModel = (value: string) => value.replace(/\s+/g, '').toLowerCase();
const normTitle = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** Stage previously verified catalog knowledge only. Never approve or expose its content. */
export async function stageCatalogKnowledgeForAppliance(input: {
  propertyId: string; applianceId: string; catalogId: string;
}): Promise<StagingResult> {
  const admin = createAdminClient() as any;
  const { data: appliance, error: applianceError } = await admin.from('property_appliances')
    .select('id, property_id, catalog_id, model_number').eq('id', input.applianceId)
    .eq('property_id', input.propertyId).eq('catalog_id', input.catalogId).maybeSingle();
  if (applianceError || !appliance?.model_number) return { manualSections: 0, answerDrafts: 0, error: 'Appliance is not linked to a confirmed model.' };
  const { data: catalog, error: catalogError } = await admin.from('appliance_catalog')
    .select('id, model').eq('id', input.catalogId).maybeSingle();
  if (catalogError || !catalog || normModel(catalog.model) !== normModel(appliance.model_number))
    return { manualSections: 0, answerDrafts: 0, error: 'Catalog model does not match this appliance.' };
  const { data: rows, error: sourceError } = await admin.from('appliance_catalog_knowledge')
    .select('id, catalog_id, question, answer, source_url, verified_at')
    .eq('catalog_id', input.catalogId).not('verified_at', 'is', null)
    .order('created_at', { ascending: true }).limit(40);
  if (sourceError || !rows) return { manualSections: 0, answerDrafts: 0, error: 'Could not read catalog sources.' };
  if (rows.length === 0) return { manualSections: 0, answerDrafts: 0 };

  const [sectionsRead, answersRead] = await Promise.all([
    admin.from('appliance_manual_sections').select('section_title')
      .eq('property_id', input.propertyId).eq('appliance_id', input.applianceId),
    admin.from('appliance_answers').select('question')
      .eq('property_id', input.propertyId).eq('appliance_id', input.applianceId),
  ]);
  if (sectionsRead.error || answersRead.error)
    return { manualSections: 0, answerDrafts: 0, error: 'Could not check existing appliance knowledge.' };
  const seen = new Set((sectionsRead.data ?? []).map((row: { section_title: string }) => normTitle(row.section_title)));
  const sections: { property_id: string; appliance_id: string; section_title: string; body: string; page_ref: string; requires_licensed_technician: boolean }[] = [];
  for (const row of rows as CatalogKnowledgeCandidate[]) {
    const title = row.question?.trim().slice(0, 240);
    const body = row.answer?.trim().slice(0, 30000);
    if (!title || !body || body.length < 20 || !row.source_url?.startsWith('https://')
      || seen.has(normTitle(title)) || redactCredentials(`${title}\n${body}`).redactions.length) continue;
    sections.push({ property_id: input.propertyId, appliance_id: input.applianceId,
      section_title: title, body, page_ref: row.source_url,
      requires_licensed_technician: requiresLicensedTechnician(`${title}\n${body}`) });
    seen.add(normTitle(title));
  }
  if (sections.length) {
    const { error } = await admin.from('appliance_manual_sections').insert(sections);
    if (error) return { manualSections: 0, answerDrafts: 0, error: 'Could not stage manual excerpts.' };
  }
  const drafts = catalogAnswerDrafts({ propertyId: input.propertyId, applianceId: input.applianceId,
    catalogId: input.catalogId, modelNumber: appliance.model_number, catalogModel: catalog.model,
    rows, existingQuestions: (answersRead.data ?? []).map((row: { question: string }) => row.question) });
  if (drafts.length) {
    const { error } = await admin.from('appliance_answers').insert(drafts);
    if (error) return { manualSections: sections.length, answerDrafts: 0, error: 'Could not stage question drafts.' };
  }
  return { manualSections: sections.length, answerDrafts: drafts.length };
}
