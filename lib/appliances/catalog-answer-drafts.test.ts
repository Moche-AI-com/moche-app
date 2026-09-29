import { describe, expect, it } from 'vitest';
import { catalogAnswerDrafts, type CatalogKnowledgeCandidate } from './catalog-answer-drafts';

const row: CatalogKnowledgeCandidate = {
  id: '00000000-0000-4000-8000-000000000001', catalog_id: 'catalog-a',
  question: 'How do I start the washer?', answer: 'Press Start on the control panel.',
  source_url: 'https://manufacturer.example/manual', verified_at: '2026-09-28T12:00:00Z',
};
const input = { propertyId: 'property-a', applianceId: 'appliance-a', catalogId: 'catalog-a',
  modelNumber: 'MODEL 1', catalogModel: 'MODEL1', rows: [row] };

describe('catalog answer drafts', () => {
  it('stages a matching sourced question as a draft only', () => {
    expect(catalogAnswerDrafts(input)).toEqual([{ property_id: 'property-a', appliance_id: 'appliance-a',
      question: row.question, answer: row.answer, source_kind: 'catalog',
      source_ref: `catalog:${row.id}`, model_number_snapshot: 'MODEL 1', status: 'draft' }]);
  });
  it('rejects mismatched models, catalogs and unverifiable sources', () => {
    expect(catalogAnswerDrafts({ ...input, catalogModel: 'MODEL2' })).toEqual([]);
    expect(catalogAnswerDrafts({ ...input, rows: [{ ...row, catalog_id: 'catalog-b' }] })).toEqual([]);
    expect(catalogAnswerDrafts({ ...input, rows: [{ ...row, verified_at: null }] })).toEqual([]);
    expect(catalogAnswerDrafts({ ...input, rows: [{ ...row, source_url: null }] })).toEqual([]);
  });
  it('rejects unsafe or duplicate questions and manual headings that are not questions', () => {
    expect(catalogAnswerDrafts({ ...input, existingQuestions: [row.question.toUpperCase()] })).toEqual([]);
    expect(catalogAnswerDrafts({ ...input, rows: [{ ...row, question: 'Usage and care' }] })).toEqual([]);
    expect(catalogAnswerDrafts({ ...input, rows: [{ ...row, answer: 'Password: mySecret123' }] })).toEqual([]);
    expect(catalogAnswerDrafts({ ...input, rows: [{ ...row, answer: 'Call a licensed electrician to repair the panel.' }] })).toEqual([]);
  });
});
