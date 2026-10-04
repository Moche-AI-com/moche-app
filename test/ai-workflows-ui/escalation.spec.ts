import { ACTIONS, ESCALATION_ID, expect, openWorkflow, test } from './fixtures';

for (const category of ['auto', 'house_rules']) {
  test(`escalation ${category === 'auto' ? 'default Auto' : 'manual category override'} reaches the action unchanged`, async ({ page, mocks }) => {
    mocks.respond(`${ACTIONS}answer`, {
      json: { ok: true, messageStored: true, learningQueued: true, notification: { status: 'skipped' } },
    });
    await openWorkflow(page, 'escalation');
    await expect(page.getByRole('checkbox', { name: /Propose a Property Brain update/ })).toBeChecked();
    await expect(page.getByLabel('Category', { exact: true })).toHaveValue('auto');
    if (category !== 'auto') await page.getByLabel('Category', { exact: true }).selectOption(category);
    await page.getByLabel('Your answer', { exact: true }).fill('Synthetic host answer for the review queue.');
    expect(mocks.calls(`${ACTIONS}answer`)).toHaveLength(0);
    await page.getByRole('button', { name: 'Save reply & propose Brain update', exact: true }).click();
    await expect(page.getByText(/A Brain proposal is waiting for approval/)).toBeVisible();
    expect(mocks.calls(`${ACTIONS}answer`)).toHaveLength(1);
    expect(mocks.calls(`${ACTIONS}answer`)[0].body).toMatchObject({
      escalationId: ESCALATION_ID, response: 'Synthetic host answer for the review queue.',
      convertToBrain: 'on', brainCategory: category,
    });
  });
}

test('one-off escalation reply excludes learning fields and reports independent warning', async ({ page, mocks }) => {
  const warning = 'Synthetic follow-up warning: your saved reply was not queued as a Brain proposal.';
  mocks.respond(`${ACTIONS}answer`, {
    json: { ok: true, messageStored: true, learningQueued: false, warning, notification: { status: 'failed' } },
  });
  await openWorkflow(page, 'escalation');
  await page.getByRole('checkbox', { name: /Propose a Property Brain update/ }).uncheck();
  await expect(page.getByLabel('Category', { exact: true })).toHaveCount(0);
  await page.getByLabel('Your answer', { exact: true }).fill('Synthetic one-off host reply.');
  await page.getByRole('button', { name: 'Save reply', exact: true }).click();
  await expect(page.getByText(warning, { exact: false })).toBeVisible();
  expect(mocks.calls(`${ACTIONS}answer`)).toHaveLength(1);
  const data = mocks.calls(`${ACTIONS}answer`)[0].body;
  expect(data).toMatchObject({ escalationId: ESCALATION_ID, response: 'Synthetic one-off host reply.' });
  expect(data).not.toHaveProperty('convertToBrain');
  expect(data).not.toHaveProperty('brainCategory');
  await expect(page.getByText(/A Brain proposal is waiting for approval/)).toHaveCount(0);
});

test('reply-only permission hides the learning controls and never submits a learning choice', async ({ page, mocks }) => {
  mocks.respond(`${ACTIONS}answer`, { json: { error: 'Synthetic reply failed. Please try again.' } });
  await openWorkflow(page, 'escalation', '&teach=0');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByLabel('Category', { exact: true })).toHaveCount(0);
  await page.getByLabel('Your answer', { exact: true }).fill('Synthetic reply-only answer.');
  await page.getByRole('button', { name: 'Save reply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic reply failed');
  expect(mocks.calls(`${ACTIONS}answer`)).toHaveLength(1);
  expect(mocks.calls(`${ACTIONS}answer`)[0].body).not.toHaveProperty('convertToBrain');
  expect(mocks.calls(`${ACTIONS}answer`)[0].body).not.toHaveProperty('brainCategory');
});
