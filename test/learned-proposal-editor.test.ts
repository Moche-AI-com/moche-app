import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real component's render and event handlers without a browser or
// external requests. Only the React state boundary and navigation are replaced.
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, refresh: vi.fn(), fetch: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [state.values[i], (value: unknown) => { state.values[i] = value; }];
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }));
import { UpdateQueueClient, type ProposalRow } from '@/app/dashboard/updates/UpdateQueueClient';
import { normalizeProposedValue, proposableField } from '@/lib/brain/proposals';

const value = {
  question: 'When is checkout?', answer: '11 AM', category: 'checkin_checkout', section: 'checkout',
  model: 'synthetic-strong-model', rationale: 'Reusable host guidance', sourceMessageIds: [],
};
const proposal: ProposalRow = {
  id: 'synthetic-update', property_id: 'synthetic-property', field_path: 'host_qa.guest_reply',
  label: 'Reusable host answer', status: 'pending', proposed_value: value,
  original_value: null, applied_value: null, source_type: 'ai_suggestion', source_ref: null,
  confidence: null, resolution_note: null, reviewed_at: null, created_at: '2026-09-08T00:00:00Z',
};
function render(row: ProposalRow = proposal, manageable = true) {
  state.cursor = 0;
  return UpdateQueueClient({
    rows: [row], view: row.status === 'pending' ? 'pending' : 'reviewed',
    propertyNames: { 'synthetic-property': 'Synthetic property' },
    manageableProperties: manageable ? ['synthetic-property'] : [],
  });
}
function elements(tree: unknown): ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  return [tree, ...elements((tree.props as any).children)];
}
function button(tree: unknown, text: string) {
  const found = elements(tree).find((e) => e.type === 'button' && renderToStaticMarkup(e).includes(text));
  expect(found, `Button ${text}`).toBeDefined();
  return found!;
}
function openEditor(row = proposal) {
  button(render(row), 'Edit first').props.onClick();
  return render(row);
}

beforeEach(() => {
  state.values = [];
  state.cursor = 0;
  vi.clearAllMocks();
  vi.stubGlobal('React', React);
  vi.stubGlobal('fetch', state.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
});

describe('learned answer review editor', () => {
  it('shows the full question, answer and filing before approval', () => {
    button(render(), 'Read it').props.onClick();
    const html = renderToStaticMarkup(render());
    expect(html).toContain(value.question);
    expect(html).toContain(value.answer);
    expect(html).toContain(value.category);
    expect(html).toContain(value.section);
  });

  it.each(['11 AM', 'Use the side door'])('edits a short answer while preserving its question and provenance: %s', async (answer) => {
    let tree = openEditor();
    const textarea = elements(tree).find((e) => e.type === 'textarea')!;
    expect(textarea.props.value).toBe(value.answer);
    expect(renderToStaticMarkup(tree)).toContain(value.question);
    textarea.props.onChange({ target: { value: answer } });
    tree = render();
    const save = button(tree, 'Save my version');
    expect(save.props.disabled).toBe(false);
    await save.props.onClick();
    const sent = JSON.parse(state.fetch.mock.calls[0][1].body);
    expect(sent).toEqual({ decision: 'modify', value: { ...value, answer } });
    expect(sent.value).not.toHaveProperty('text');
    expect(normalizeProposedValue(proposableField('host_qa.guest_reply')!, sent.value).ok).toBe(true);
  });

  it('keeps the generic Brain text minimum unchanged', () => {
    const row = { ...proposal, field_path: 'brain.listing_summary',
      proposed_value: { title: 'Synthetic entry', text: 'A sufficiently detailed generic entry.', category: 'core' } };
    const tree = openEditor(row);
    elements(tree).find((e) => e.type === 'textarea')!.props.onChange({ target: { value: '11 AM' } });
    expect(button(render(row), 'Save my version').props.disabled).toBe(true);
  });

  it('shows incomplete application honestly without rendering raw provider errors', () => {
    const row = { ...proposal, status: 'approved' as const, applied_value: value,
      applied_at: null, apply_error: 'Synthetic private provider response.' };
    button(render(row), 'Read it').props.onClick();
    const html = renderToStaticMarkup(render(row));
    expect(html).toContain('Application incomplete');
    expect(html).not.toContain('What was saved');
    expect(html).not.toContain(row.apply_error);
  });

  it('keeps unassigned property proposals read-only', () => {
    expect(renderToStaticMarkup(render(proposal, false))).not.toContain('Edit first');
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
