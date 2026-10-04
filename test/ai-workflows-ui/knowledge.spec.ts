import { ACTIONS, INGEST, PROPERTY_ID, expect, openWorkflow, test } from './fixtures';

const original = 'Synthetic rough note: the reading lamp switch is on its base.';
const improved = 'Synthetic AI draft: use the switch on the reading lamp base.';

test('AI improvement remains an editable draft until the host explicitly saves', async ({ page, mocks }) => {
  mocks.respond(`${ACTIONS}improve`, { json: { ok: true, improved } });
  mocks.respond(`${ACTIONS}save`, { json: { ok: true } });
  await openWorkflow(page, 'knowledge');
  await expect(page.getByRole('button', { name: 'Improve with AI' })).toBeDisabled();
  await page.getByLabel('Title', { exact: true }).fill('Synthetic reading lamp');
  await page.getByLabel('Details', { exact: true }).fill(original);
  await page.getByLabel('Section', { exact: true }).selectOption('house_rules');
  await page.getByLabel('Visibility', { exact: true }).selectOption('internal');
  await page.getByRole('button', { name: 'Improve with AI' }).click();
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue(improved);
  await expect(page.getByText(/Draft improved above/)).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Synthetic reading lamp');
  await expect(page.getByLabel('Section', { exact: true })).toHaveValue('house_rules');
  await expect(page.getByLabel('Visibility', { exact: true })).toHaveValue('internal');
  expect(mocks.calls(`${ACTIONS}save`)).toHaveLength(0);
  expect(mocks.calls(`${ACTIONS}improve`)[0].body).toMatchObject({
    propertyId: PROPERTY_ID, title: 'Synthetic reading lamp', body: original,
    section: 'house_rules', visibility: 'internal',
  });
  const reviewed = `${improved} Synthetic host-reviewed wording.`;
  await page.getByLabel('Details', { exact: true }).fill(reviewed);
  await page.getByRole('button', { name: 'Add to Brain', exact: true }).click();
  await expect.poll(() => mocks.calls(`${ACTIONS}save`).length).toBe(1);
  expect(mocks.calls(`${ACTIONS}save`)[0].body).toMatchObject({
    propertyId: PROPERTY_ID, title: 'Synthetic reading lamp', body: reviewed,
    section: 'house_rules', sectionLabel: 'House rules', visibility: 'internal',
  });
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue('');
  await expect(page.getByText(/Saved.*indexed/)).toBeVisible();
});

test('failed AI improvement and failed manual save retain the full host draft', async ({ page, mocks }) => {
  mocks.respond(`${ACTIONS}improve`, { json: { error: 'Synthetic AI unavailable. Your draft is unchanged.' } });
  mocks.respond(`${ACTIONS}save`, { json: { error: 'Synthetic save failed. Please try again.' } });
  await openWorkflow(page, 'knowledge');
  await page.getByLabel('Title', { exact: true }).fill('Synthetic host-only draft');
  await page.getByLabel('Details', { exact: true }).fill(original);
  await page.getByLabel('Section', { exact: true }).selectOption('house_rules');
  await page.getByLabel('Visibility', { exact: true }).selectOption('internal');
  await page.getByRole('button', { name: 'Improve with AI' }).click();
  await expect(page.getByText('Synthetic AI unavailable. Your draft is unchanged.')).toBeVisible();
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue(original);
  expect(mocks.calls(`${ACTIONS}save`)).toHaveLength(0);
  await page.getByRole('button', { name: 'Add to Brain', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic save failed');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Synthetic host-only draft');
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue(original);
  await expect(page.getByLabel('Section', { exact: true })).toHaveValue('house_rules');
  await expect(page.getByLabel('Visibility', { exact: true })).toHaveValue('internal');
  expect(mocks.calls(`${ACTIONS}save`)).toHaveLength(1);
});

test('saved-but-unindexed feedback retains the AI draft and retries the same item', async ({ page, mocks }, testInfo) => {
  const warning = 'Synthetic item saved, but indexing failed. Your draft is kept below for review.';
  const savedId = '44444444-4444-4444-8444-444444444444';
  mocks.respond(`${ACTIONS}improve`, { json: { ok: true, improved } });
  mocks.respond(`${ACTIONS}save`, { json: { ok: true, itemId: savedId, warning } });
  await openWorkflow(page, 'knowledge');
  await page.getByLabel('Title', { exact: true }).fill('Synthetic retained title');
  await page.getByLabel('Details', { exact: true }).fill(original);
  await page.getByLabel('Section', { exact: true }).selectOption('house_rules');
  await page.getByLabel('Visibility', { exact: true }).selectOption('internal');
  await page.getByRole('button', { name: 'Improve with AI' }).click();
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue(improved);
  await page.getByRole('button', { name: 'Add to Brain', exact: true }).click();
  await expect(page.getByText(warning, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Synthetic retained title');
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue(improved);
  await expect(page.getByLabel('Section', { exact: true })).toHaveValue('house_rules');
  await expect(page.getByLabel('Visibility', { exact: true })).toHaveValue('internal');
  await expect(page.getByText(/Saved and indexed|It is indexed and your concierge can use it right away/)).toHaveCount(0);
  expect(mocks.calls(`${ACTIONS}save`)).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath(`indexing-warning-${testInfo.project.name}.png`), fullPage: true });
  mocks.respond(`${ACTIONS}save`, { json: { ok: true } });
  await page.getByRole('button', { name: 'Add to Brain', exact: true }).click();
  await expect.poll(() => mocks.calls(`${ACTIONS}save`).length).toBe(2);
  expect(mocks.calls(`${ACTIONS}save`)[1].body).toMatchObject({
    propertyId: PROPERTY_ID, itemId: savedId, title: 'Synthetic retained title',
    body: improved, section: 'house_rules', visibility: 'internal',
  });
  await expect(page.getByText(/Saved and indexed/)).toBeVisible();
  await expect(page.getByLabel('Details', { exact: true })).toHaveValue('');
});

test('truncated pasted notes show the review warning without discarding any original input', async ({ page, mocks }) => {
  // Long enough to exercise the response's truncation contract without relying
  // on model behavior or on a particular implementation of the backend limit.
  const pasted = `${'Synthetic household note. '.repeat(1000)}END OF ORIGINAL NOTES`;
  const warning = 'Synthetic review draft was truncated. Keep the original notes and review omitted details before approval.';
  mocks.respond(`${INGEST}text`, {
    json: { ok: true, queued: true, standardized: false, truncated: true, message: warning },
  });
  await openWorkflow(page, 'knowledge');
  await page.getByRole('button', { name: 'Paste notes', exact: true }).click();
  await page.getByTestId('input-add-paste').fill(pasted);
  await page.getByPlaceholder('Title (optional)', { exact: true }).fill('Synthetic original notes');
  await page.getByRole('combobox').selectOption('house_rules');
  await page.getByRole('button', { name: /Clean.*review/i }).click();
  await expect(page.getByText(warning, { exact: true })).toBeVisible();
  // Compare the full input, but keep a truncation regression from dumping
  // 25,000 characters into CI output.
  await expect.poll(async () => (await page.getByTestId('input-add-paste').inputValue()) === pasted,
    { message: 'Every character of the original pasted notes must be retained' }).toBe(true);
  await expect(page.getByPlaceholder('Title (optional)', { exact: true })).toHaveValue('Synthetic original notes');
  await expect(page.getByRole('combobox')).toHaveValue('house_rules');
  expect(mocks.calls(`${INGEST}text`)).toHaveLength(1);
  expect(mocks.calls(`${INGEST}text`)[0].body).toMatchObject({
    text: pasted, title: 'Synthetic original notes', category: 'house_rules',
  });
  expect(mocks.calls(`${ACTIONS}save`)).toHaveLength(0);
});

test('URL import failure keeps inputs; success says review queue rather than published', async ({ page, mocks }) => {
  mocks.respond(`${INGEST}url`, { status: 502, json: { error: 'Synthetic URL could not be read. Try Paste notes.' } });
  await openWorkflow(page, 'knowledge');
  await page.getByRole('button', { name: 'From a URL', exact: true }).click();
  await page.getByTestId('input-add-url').fill('https://synthetic.invalid/manual');
  await page.getByPlaceholder('Title (optional)', { exact: true }).fill('Synthetic lamp manual');
  await page.getByRole('combobox').selectOption('appliances');
  await page.getByRole('button', { name: 'Fetch details', exact: true }).click();
  await expect(page.getByText('Synthetic URL could not be read. Try Paste notes.')).toBeVisible();
  await expect(page.getByTestId('input-add-url')).toHaveValue('https://synthetic.invalid/manual');
  await expect(page.getByPlaceholder('Title (optional)', { exact: true })).toHaveValue('Synthetic lamp manual');
  await expect(page.getByRole('combobox')).toHaveValue('appliances');
  mocks.respond(`${INGEST}url`, {
    json: { ok: true, queued: true, truncated: false, message: 'Synthetic manual is in your review queue. Nothing has been published.' },
  });
  await page.getByRole('button', { name: 'Fetch details', exact: true }).click();
  await expect(page.getByText('Synthetic manual is in your review queue. Nothing has been published.')).toBeVisible();
  expect(mocks.calls(`${INGEST}url`)).toHaveLength(2);
  expect(mocks.calls(`${INGEST}url`)[1].body).toMatchObject({
    url: 'https://synthetic.invalid/manual', title: 'Synthetic lamp manual', category: 'appliances',
  });
  await expect(page.getByTestId('input-add-url')).toHaveValue('');
});

test('file import posts the selected file only to the mock endpoint and displays review feedback', async ({ page, mocks }) => {
  mocks.respond(`${INGEST}document`, {
    json: { ok: true, queued: true, message: 'Synthetic document proposal is ready for review before guests can see it.' },
  });
  await openWorkflow(page, 'knowledge');
  await page.getByRole('button', { name: 'Upload a file', exact: true }).click();
  await page.getByTestId('input-add-file').setInputFiles({
    name: 'synthetic-manual.txt', mimeType: 'text/plain', buffer: Buffer.from(original),
  });
  await page.getByRole('combobox').selectOption('house_rules');
  await page.getByRole('button', { name: /Upload.*review/i }).click();
  await expect(page.getByText('Synthetic document proposal is ready for review before guests can see it.')).toBeVisible();
  expect(mocks.calls(`${INGEST}document`)).toHaveLength(1);
  const request = mocks.calls(`${INGEST}document`)[0];
  expect(request.method).toBe('POST');
  expect(request.contentType).toContain('multipart/form-data');
  expect(request.body).toContain('synthetic-manual.txt');
  expect(request.body).toContain(original);
  expect(request.body).toContain('house_rules');
  await expect(page.getByTestId('input-add-file')).toHaveValue('');
});
