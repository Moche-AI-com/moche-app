import { GUEST, REQUEST_ID, expect, openWorkflow, test } from './fixtures';

for (const phase of ['start', 'followup']) {
  for (const status of [500, 409]) {
    test(`${phase} safety guidance survives HTTP ${status} without a saved or notified claim`, async ({ page, mocks }) => {
      const guidance = 'If you smell gas, leave the unit right away. <img src=x> Call your local gas emergency line once outside.';
      mocks.respond(`${GUEST}service-requests`, { json: { requests: [] } });
      const failed = { status, json: {
        error: 'This update was not saved. Your host was not notified.',
        safetyMessage: guidance, reportSaved: false, hostNotified: false,
      } };
      mocks.respond(`${GUEST}service-request/start`, phase === 'start' ? failed : {
        json: { id: REQUEST_ID, status: 'in_progress', question: 'Which room?' },
      });
      mocks.respond(`${GUEST}service-request/${REQUEST_ID}/message`, failed);
      await openWorkflow(page, 'needs');
      await page.getByRole('textbox', { name: 'Report Maintenance', exact: true }).fill(
        phase === 'start' ? 'I smell gas in the kitchen' : 'Loose doorknob',
      );
      await page.getByRole('button', { name: 'Start report', exact: true }).click();
      if (phase === 'followup') {
        await page.getByRole('textbox', { name: 'Type your answer…', exact: true }).fill('I smell gas in the kitchen');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
      }
      await expect(page.getByRole('alert')).toContainText(guidance);
      await expect(page.getByRole('alert')).toContainText('not saved');
      await expect(page.getByRole('alert')).toContainText('not notified');
      await expect(page.getByRole('alert').locator('img')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /Your host has been alerted|Report submitted/ })).toHaveCount(0);
      await expect(page.locator('.gp-ref')).toHaveCount(0);
      await expect(page.getByRole('textbox')).toHaveValue('I smell gas in the kitchen');
    });
  }
}

test('initial safety guidance is escaped text and does not leak into a subsequent nonurgent report', async ({ page, mocks }) => {
  const guidance = 'Move to a safe place. <img src=x onerror="window.unsafeGuidance=true"> Call local emergency services.';
  mocks.respond(`${GUEST}service-requests`, { json: { requests: [] } });
  mocks.respond(`${GUEST}service-request/start`, {
    json: { id: REQUEST_ID, status: 'safety_escalated', guestMessage: guidance },
  });
  await openWorkflow(page, 'needs');
  await page.getByRole('textbox', { name: 'Report Maintenance', exact: true }).fill('Synthetic urgent first report.');
  await page.getByRole('button', { name: 'Start report', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(guidance);
  await expect(page.getByRole('alert').locator('img')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.evaluate(() => 'unsafeGuidance' in window)).toBe(false);

  mocks.respond(`${GUEST}service-request/start`, {
    json: { id: REQUEST_ID, status: 'completed', report: { summary: 'Synthetic loose knob report.' } },
  });
  await page.getByRole('button', { name: 'Report another issue', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Report Maintenance', exact: true }).fill('Synthetic loose knob.');
  await page.getByRole('button', { name: 'Start report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report submitted', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic loose knob report.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(guidance, { exact: true })).toHaveCount(0);
  expect(mocks.calls(`${GUEST}service-request/start`)).toHaveLength(2);
});

test('missing safety guidance keeps the existing completion fallback without rendering undefined', async ({ page, mocks }) => {
  mocks.respond(`${GUEST}service-requests`, { json: { requests: [] } });
  mocks.respond(`${GUEST}service-request/start`, {
    json: { id: REQUEST_ID, status: 'safety_escalated' },
  });
  await openWorkflow(page, 'needs');
  await page.getByRole('textbox', { name: 'Report Maintenance', exact: true }).fill('Synthetic urgent report.');
  await page.getByRole('button', { name: 'Start report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your host has been alerted', exact: true })).toBeVisible();
  await expect(page.getByText('This was treated as urgent and sent to your host right away.', { exact: true })).toBeVisible();
  await expect(page.getByText('undefined', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});
