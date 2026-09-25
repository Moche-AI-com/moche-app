import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.mapbox.com/**', (route) => route.abort());
  await page.goto('/');
});

test('failed save retains every draft field, especially guest visibility', async ({ page }) => {
  await page.getByRole('button', { name: 'Add your own place', exact: true }).click();
  await page.getByLabel('Place name', { exact: true }).fill('Fail save');
  await page.getByLabel('Host note · shared with guests').fill('Do not lose this note');
  await page.getByLabel('Guest visibility').selectOption('hidden');
  await page.getByLabel('Favorite', { exact: true }).check();
  await page.getByRole('button', { name: 'Add place', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save');
  await expect(page.getByLabel('Place name', { exact: true })).toHaveValue('Fail save');
  await expect(page.getByLabel('Host note · shared with guests')).toHaveValue('Do not lose this note');
  await expect(page.getByLabel('Guest visibility')).toHaveValue('hidden');
  await expect(page.getByLabel('Favorite', { exact: true })).toBeChecked();
});

test('guest-visible places need an address or map pin, but drafts can be saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Add your own place', exact: true }).click();
  await page.getByLabel('Place name', { exact: true }).fill('Name-only café');
  await page.getByRole('button', { name: 'Add place', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add an address or map pin');
  await page.getByLabel('Guest visibility').selectOption('suggested');
  await page.getByRole('button', { name: 'Add place', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Place saved.');
  await page.getByRole('button', { name: 'Needs review (1)' }).click();
  await expect(page.locator('#place-created')).toContainText('Name-only café');
});

test('map click populates a manual point, while clear and cancel preserve details', async ({ page }) => {
  await page.getByRole('button', { name: 'Add your own place', exact: true }).click();
  await page.getByLabel('Place name', { exact: true }).fill('Manual Cafe');
  await page.getByRole('button', { name: 'Choose on map' }).click();
  await page.getByTestId('local-map').click({ position: { x: 60, y: 200 } });
  await expect(page.getByLabel('Latitude (optional)')).toHaveValue('27.510000');
  await expect(page.getByLabel('Longitude (optional)')).toHaveValue('-82.390000');
  await page.getByRole('button', { name: 'Clear coordinates' }).click();
  await expect(page.getByLabel('Latitude (optional)')).toHaveValue('');
  await page.getByRole('button', { name: 'Choose on map' }).click();
  await page.getByRole('button', { name: 'Cancel location selection' }).click();
  await expect(page.getByLabel('Place name', { exact: true })).toHaveValue('Manual Cafe');
});

test('visibility views and search keep hidden places recoverable', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Hidden (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Hidden (1)' }).click();
  await expect(page.locator('#place-saved')).toContainText('Saved Cafe');
  await page.getByLabel('Search hidden').fill('unknown');
  await expect(page.locator('#place-saved')).toHaveCount(0);
  await expect(page.getByText('No places match this search.')).toBeVisible();
  await page.getByLabel('Search hidden').fill('Saved');
  await expect(page.locator('#place-saved')).toBeVisible();
});

test('keyboard selects a hidden pin and saving updates its card and popup note', async ({ page }) => {
  const pin = page.getByRole('button', { name: /Saved Cafe.*Open place details/ });
  await pin.focus(); await page.keyboard.press('Enter');
  await page.getByLabel('Host note · shared with guests').fill('Updated note');
  await page.getByLabel('Guest visibility').selectOption('approved');
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  await expect(page.locator('#place-saved')).toContainText('Your tip: Updated note');
  await expect(pin).toHaveAttribute('title', 'Saved CafeUpdated note');
});

test('temporary search selection never prefills the manual form', async ({ page }) => {
  await page.route('**/api/host/**/local/search?*', (route) => route.fulfill({
    json: { source: 'hybrid', usedFallback: true, results: [{
      id: 'mapbox:temporary', name: 'Remote Cafe', category: 'cafe', categoryLabel: 'Cafe',
      source: 'mapbox', sourceLabel: 'Map suggestion', inLibrary: false,
      detail: null, address: '1 Remote Road', rating: null, distanceMeters: 100, lat: 27.5, lng: -82.4,
    }] },
  }));
  await page.getByLabel('Search saved places & nearby suggestions').fill('remote');
  await page.getByRole('button', { name: 'View on map' }).click();
  await expect(page.getByRole('status')).toContainText('temporary suggestion, not saved');
  await page.getByRole('button', { name: 'Add manually', exact: true }).first().click();
  await expect(page.getByLabel('Place name', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Latitude (optional)')).toHaveValue('');
});

test('a map failure leaves manual entry usable', async ({ page }) => {
  await page.goto('/?mapFail');
  await expect(page.getByRole('button', { name: 'Retry map' })).toBeVisible();
  await page.getByRole('button', { name: 'Add your own place', exact: true }).click();
  await page.getByLabel('Place name', { exact: true }).fill('Offline map cafe');
  await page.getByLabel('Address', { exact: true }).fill('100 Offline Street');
  await page.getByRole('button', { name: 'Add place', exact: true }).click();
  await expect(page.locator('#place-created')).toContainText('Offline map cafe');
});
