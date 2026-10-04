import { INGEST, PROPERTY_ID, expect, openWorkflow, test } from './fixtures';

test('setup import warning survives URL cleanup and refresh does not repeat the import', async ({ page, mocks }, testInfo) => {
  const warning = 'Synthetic listing imported with indexing failures. Review and retry the affected items.';
  mocks.respond(`${INGEST}url`, {
    json: {
      ok: true, autofilled: true, message: warning,
      filed: [{ category: 'house_rules', title: 'Synthetic quiet hours', brainItemId: '44444444-4444-4444-8444-444444444444' }],
    },
  });
  await openWorkflow(page, 'setup', '&import=https%3A%2F%2Fsynthetic.invalid%2Flisting&view=summary#mock-review');
  await expect.poll(() => new URL(page.url()).searchParams.has('import')).toBe(false);
  await expect(page.getByRole('status')).toContainText(warning);
  await expect(page.getByRole('link', { name: 'Review & manage your Brain', exact: true }))
    .toHaveAttribute('href', `/dashboard/properties/${PROPERTY_ID}/brain`);
  expect(mocks.calls(`${INGEST}url`)).toHaveLength(1);
  expect(mocks.calls(`${INGEST}url`)[0].body).toMatchObject({
    url: 'https://synthetic.invalid/listing', category: 'core', visibility: 'guest',
  });
  expect(new URL(page.url()).searchParams.get('view')).toBe('summary');
  expect(new URL(page.url()).hash).toBe('#mock-review');
  await page.screenshot({ path: testInfo.outputPath(`setup-warning-${testInfo.project.name}.png`), fullPage: true });
  await page.reload();
  await expect(page.getByText('No pending listing import.', { exact: true })).toBeVisible();
  expect(mocks.calls(`${INGEST}url`)).toHaveLength(1);
});

test('failed setup import keeps its actionable error visible after cleanup', async ({ page, mocks }) => {
  mocks.respond(`${INGEST}url`, { status: 502, json: { error: 'Synthetic listing is unavailable. Add your notes manually.' } });
  await openWorkflow(page, 'setup', '&import=https%3A%2F%2Fsynthetic.invalid%2Flisting');
  await expect.poll(() => new URL(page.url()).searchParams.has('import')).toBe(false);
  await expect(page.getByRole('status')).toContainText('Synthetic listing is unavailable. Add your notes manually.');
  await expect(page.getByRole('link', { name: 'Add the details yourself', exact: true }))
    .toHaveAttribute('href', `/dashboard/properties/${PROPERTY_ID}/brain`);
  expect(mocks.calls(`${INGEST}url`)).toHaveLength(1);
});
