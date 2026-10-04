import { GUEST, REQUEST_ID, expect, openWorkflow, test } from './fixtures';

test('Guest Needs renders a real interview choice then its final summary without another question', async ({ page, mocks }) => {
  mocks.respond(`${GUEST}service-requests`, { json: { requests: [] } });
  mocks.respond(`${GUEST}service-request/start`, {
    json: { id: REQUEST_ID, status: 'in_progress', question: 'Synthetic question: which room needs a lamp?', choices: ['Synthetic study', 'Synthetic lounge'] },
  });
  mocks.respond(`${GUEST}service-request/${REQUEST_ID}/message`, {
    json: { id: REQUEST_ID, status: 'completed', report: { summary: 'Synthetic service report: replace the study lamp.' } },
  });
  await openWorkflow(page, 'needs');
  await page.getByRole('textbox', { name: 'Report Maintenance', exact: true }).fill('Synthetic reading lamp stopped working.');
  await page.getByRole('button', { name: 'Start report', exact: true }).click();
  await expect(page.getByText('Synthetic question: which room needs a lamp?', { exact: false })).toBeVisible();
  expect(mocks.calls(`${GUEST}service-request/start`)).toHaveLength(1);
  expect(mocks.calls(`${GUEST}service-request/${REQUEST_ID}/message`)).toHaveLength(0);
  await page.getByRole('button', { name: 'Synthetic study', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Report submitted', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic service report: replace the study lamp.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
  expect(mocks.calls(`${GUEST}service-request/${REQUEST_ID}/message`)).toHaveLength(1);
  expect(mocks.calls(`${GUEST}service-request/${REQUEST_ID}/message`)[0].body).toEqual({ message: 'Synthetic study' });
});

test('Guest Needs safety escalation displays the returned urgent guidance and ends the interview', async ({ page, mocks }) => {
  const safety = 'Synthetic safety guidance: leave the building now. Call local emergency services from a safe place.';
  mocks.respond(`${GUEST}service-requests`, { json: { requests: [] } });
  mocks.respond(`${GUEST}service-request/start`, {
    json: { id: REQUEST_ID, status: 'in_progress', question: 'Synthetic question: what is happening now?', choices: [] },
  });
  mocks.respond(`${GUEST}service-request/${REQUEST_ID}/message`, {
    json: { id: REQUEST_ID, status: 'safety_escalated', guestMessage: safety },
  });
  await openWorkflow(page, 'needs');
  await page.getByRole('textbox', { name: 'Report Maintenance', exact: true }).fill('Synthetic heater issue.');
  await page.getByRole('button', { name: 'Start report', exact: true }).click();
  await page.getByRole('textbox', { name: 'Type your answer…', exact: true }).fill('Synthetic follow-up: I now smell gas.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your host has been alerted', exact: true })).toBeVisible();
  await expect(page.getByText(safety, { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
  expect(mocks.calls(`${GUEST}service-request/${REQUEST_ID}/message`)).toHaveLength(1);
});
