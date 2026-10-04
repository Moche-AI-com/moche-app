import React, { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrainActionState } from '@/app/dashboard/properties/[id]/brain/actions';

// Render the actual callers and invoke their events, replacing only React's
// hook/action boundary. No browser, provider, database, or server action runs.
const hooks = vi.hoisted(() => ({
  scopes: new Map<string, unknown[]>(),
  scope: 'parent',
  cursor: 0,
  effects: [] as (() => unknown)[],
  result: {} as BrainActionState,
  action: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState(initial: unknown) {
    const values = hooks.scopes.get(hooks.scope)!;
    const i = hooks.cursor++;
    if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
    return [values[i], (next: unknown) => {
      values[i] = typeof next === 'function' ? next(values[i]) : next;
    }];
  },
  useRef(initial: unknown) {
    const values = hooks.scopes.get(hooks.scope)!;
    const i = hooks.cursor++;
    if (!(i in values)) values[i] = { current: initial };
    return values[i];
  },
  useMemo: (fn: () => unknown) => fn(),
  useEffect(fn: () => unknown, deps?: unknown[]) {
    const values = hooks.scopes.get(hooks.scope)!;
    const i = hooks.cursor++;
    const previous = values[i] as unknown[] | undefined;
    if (hooks.scope === 'form' && (!deps || !previous || deps.some((d, j) => !Object.is(d, previous[j])))) {
      hooks.effects.push(fn);
    }
    values[i] = deps;
  },
}));
vi.mock('react-dom', () => ({
  useFormState: () => [hooks.result, hooks.action],
}));
vi.mock('@/app/dashboard/properties/[id]/brain/actions', () => ({
  saveBrainItemAction: vi.fn(),
  deleteBrainItemAction: vi.fn(),
}));
vi.mock('@/lib/dashboard/use-dashboard-ui-state', () => ({
  useCollapsedCards: () => ({ isCollapsed: () => false, toggle: vi.fn() }),
}));

import { BrainManager } from '@/app/dashboard/properties/[id]/brain/BrainManager';
import { EnhanceBrainPanel } from '@/app/dashboard/properties/[id]/brain/EnhanceBrainPanel';
import { FormMessage } from '@/components/FormFeedback';

type Element = ReactElement<Record<string, any>>;
type Kind = 'new item' | 'inline edit' | 'enhancement answer';
const kinds: Kind[] = ['new item', 'inline edit', 'enhancement answer'];
const warning = 'Saved, but indexing failed. Your text is preserved. Try saving again to retry indexing.';
const sections = [
  { value: 'space_details', label: 'Property', blurb: '' },
  { value: 'checkout', label: 'Checkout', blurb: '' },
];
const item = {
  id: 'synthetic-existing-item', title: 'Synthetic checkout note', body: 'Leave the sample key on the table.',
  section: 'checkout', visibility: 'internal', status: 'ready', sourceType: 'manual',
};
function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  const element = tree as Element;
  return [element, ...elements(element.props.children)];
}
function renderInScope<T>(scope: string, render: () => T): T {
  hooks.scope = scope;
  hooks.cursor = 0;
  if (!hooks.scopes.has(scope)) hooks.scopes.set(scope, []);
  return render();
}
function functionElement(tree: unknown, name: string) {
  return elements(tree).find((e) => typeof e.type === 'function' && e.type.name === name);
}
function callComponent(element: Element) {
  return (element.type as (props: Record<string, any>) => Element)(element.props);
}
function openCaller(kind: Kind) {
  const root = () => renderInScope('parent', () => kind === 'enhancement answer'
    ? EnhanceBrainPanel({
      propertyId: 'synthetic-property', sections,
      questions: [
        { fieldId: 'synthetic-checkout', label: 'Checkout', prompt: 'When is checkout?',
          section: 'checkout', sectionLabel: 'Checkout', hardBlock: false },
        { fieldId: 'synthetic-parking', label: 'Parking', prompt: 'Where do guests park?',
          section: 'space_details', sectionLabel: 'Property', hardBlock: false },
      ],
    })
    : BrainManager({
      propertyId: 'synthetic-property', canEdit: true, sections,
      items: kind === 'inline edit' ? [item] : [],
    }));
  let tree = root();
  if (kind === 'inline edit') {
    const row = callComponent(functionElement(tree, 'BrainItemRow')!);
    elements(row).find((e) => e.props['data-testid'] === `button-edit-${item.id}`)!.props.onClick();
  } else {
    const testId = kind === 'new item' ? 'button-add-brain' : 'button-enhance-brain';
    elements(tree).find((e) => e.props['data-testid'] === testId)!.props.onClick();
  }
  tree = root();
  const formName = kind === 'enhancement answer' ? 'EnhanceQuestionForm' : 'BrainItemForm';
  const component = functionElement(tree, formName)!;
  expect(component).toBeDefined();
  const done = vi.fn(component.props[kind === 'enhancement answer' ? 'onSaved' : 'onDone']);
  const formElement = React.cloneElement(component, {
    [kind === 'enhancement answer' ? 'onSaved' : 'onDone']: done,
  });
  const renderForm = () => {
    const form = renderInScope('form', () => callComponent(formElement));
    for (const effect of hooks.effects.splice(0)) effect();
    return form;
  };
  const respond = async (result: BrainActionState) => {
    hooks.result = result;
    renderForm();
    await Promise.resolve(); // Also observes the old render-time queueMicrotask.
    return renderForm(); // Flush state retained by the result effect.
  };
  return { renderForm, respond, done, root, formName };
}
function field(tree: unknown, name: string) {
  return elements(tree).find((e) => e.props.name === name);
}
function messageText(tree: unknown) {
  return elements(tree).filter((e) => e.props.role === 'status').map((e) => e.props.children).join(' ');
}

beforeEach(() => {
  hooks.scopes.clear();
  hooks.effects = [];
  hooks.result = {};
  vi.clearAllMocks();
  vi.stubGlobal('React', React);
});

describe.each(kinds)('%s save outcome handling', (kind) => {
  it('keeps the editor/question open and shows indexing warnings instead of declaring completion', async () => {
    const caller = openCaller(kind);
    const tree = await caller.respond({ ok: true, itemId: item.id, warning });
    expect(caller.done).not.toHaveBeenCalled();
    expect(messageText(tree)).toContain(warning);
    const active = functionElement(caller.root(), caller.formName);
    expect(active).toBeDefined();
    if (kind === 'enhancement answer') expect(active!.props.question.fieldId).toBe('synthetic-checkout');
  });

  it('retains the saved item ID through a failed retry and submits that ID again', async () => {
    const caller = openCaller(kind);
    await caller.respond({ ok: true, itemId: item.id, warning });
    const tree = await caller.respond({ error: 'Could not save this update. Please retry.' });
    expect(field(tree, 'itemId')?.props.value).toBe(item.id);
    expect(elements(tree).find((e) => e.type === FormMessage)?.props.error).toContain('Could not save');
    expect(caller.done).not.toHaveBeenCalled();
    const data = new FormData();
    for (const input of elements(tree).filter((e) => e.type === 'input' && e.props.type === 'hidden')) {
      data.set(input.props.name, input.props.value);
    }
    await tree.props.action(data);
    expect(hooks.action.mock.calls.at(-1)?.[0].get('itemId')).toBe(item.id);
    await caller.respond({ ok: true });
    expect(caller.done).toHaveBeenCalledTimes(1);
  });

  it.each([
    { error: 'Synthetic save error.' },
    { ok: true, itemId: item.id, warning },
  ])('cancels automatic native form reset so entered text and selections survive: %j', async (result) => {
    const caller = openCaller(kind);
    const tree = await caller.respond(result);
    const preventDefault = vi.fn();
    tree.props.onReset?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(field(tree, 'body')).toBeDefined();
    expect(field(tree, 'section')).toBeDefined();
    if (kind !== 'enhancement answer') expect(field(tree, 'visibility')).toBeDefined();
  });

  it('closes or advances only after a complete save', async () => {
    const caller = openCaller(kind);
    await caller.respond({ error: 'Synthetic save error.' });
    expect(caller.done).not.toHaveBeenCalled();
    await caller.respond({ ok: true });
    expect(caller.done).toHaveBeenCalledTimes(1);
  });
});
