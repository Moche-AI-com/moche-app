import { redactCredentials } from '@/lib/brain/redact';
import { requiresLicensedTechnician } from '@/lib/property-import/appliance-safety';

export type CatalogKnowledgeCandidate = {
  id: string; catalog_id: string; question: string; answer: string;
  source_url: string | null; verified_at: string | null;
};

export type ApplianceAnswerDraft = {
  property_id: string; appliance_id: string; question: string; answer: string;
  source_kind: 'catalog'; source_ref: string; model_number_snapshot: string; status: 'draft';
};

const key = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const modelKey = (text: string) => text.replace(/\s+/g, '').toLowerCase();

/** Suggestions only. Host approval is still required before any guest answer exists. */
export function catalogAnswerDrafts(input: {
  propertyId: string; applianceId: string; catalogId: string;
  modelNumber: string; catalogModel: string;
  rows: readonly CatalogKnowledgeCandidate[]; existingQuestions?: readonly string[];
}): ApplianceAnswerDraft[] {
  if (!input.modelNumber.trim() || modelKey(input.modelNumber) !== modelKey(input.catalogModel)) return [];
  const seen = new Set((input.existingQuestions ?? []).map(key));
  const drafts: ApplianceAnswerDraft[] = [];
  for (const row of input.rows.slice(0, 40)) {
    const question = row.question.trim();
    const answer = row.answer.trim();
    const sourceId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(row.id);
    if (row.catalog_id !== input.catalogId || !sourceId || !row.verified_at
      || !row.source_url?.startsWith('https://') || !/[?？]$/.test(question)
      || !question || question.length > 300 || !answer || answer.length > 4000
      || seen.has(key(question)) || redactCredentials(`${question}\n${answer}`).redactions.length
      || requiresLicensedTechnician(`${question}\n${answer}`)) continue;
    drafts.push({ property_id: input.propertyId, appliance_id: input.applianceId,
      question, answer, source_kind: 'catalog', source_ref: `catalog:${row.id}`,
      model_number_snapshot: input.modelNumber, status: 'draft' });
    seen.add(key(question));
    if (drafts.length === 5) break;
  }
  return drafts;
}
