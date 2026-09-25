import { test, expect } from '@playwright/test';

test('host guide remains primary and Mapbox search starts only after a guest action', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/guest/house/local/search?*', (route) => {
    calls += 1;
    return route.fulfill({ json: { source: 'mapbox_live', ephemeral: true, hostEndorsed: false, checkedAt: '2026-09-25T12:00:00Z', places: [{
      key: 'temporary-mapbox-id', name: 'Mapbox Coffee', category: 'cafe', address: '2 Main Street', lat: 42.38, lng: -71.24, distanceMeters: 120, websiteUrl: 'javascript:alert(1)', telHref: null,
    }] } });
  });
  await page.goto('/guest');
  await expect(page.getByText('Host Cafe')).toBeVisible();
  await expect(page.getByText('Try the pastries')).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Explore nearby' }).click();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Coffee', exact: true }).click();
  await expect(page.getByText('Mapbox Coffee')).toBeVisible();
  await expect(page.getByText('Mapbox · not a host pick')).toBeVisible();
  await expect(page.getByText('Host Cafe')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Host guide' }).click();
  await expect(page.getByText('Host Cafe')).toBeVisible();
  await expect(page.getByText('Mapbox Coffee')).toHaveCount(0);
});

test('live search failure leaves the host guide reachable', async ({ page }) => {
  await page.route('**/api/guest/house/local/search?*', (route) => route.fulfill({ status: 503, json: { error: 'Nearby search unavailable.' } }));
  await page.goto('/guest');
  await page.getByRole('button', { name: 'Explore nearby' }).click();
  await page.getByRole('button', { name: 'Parks', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your host guide is still available.');
  await page.getByRole('button', { name: 'Host guide' }).click();
  await expect(page.getByText('Host Cafe')).toBeVisible();
});

test('the live provider is unavailable when the server flag is off', async ({ page }) => {
  await page.goto('/guest?disabled');
  await expect(page.getByRole('button', { name: 'Explore nearby' })).toHaveCount(0);
  await expect(page.getByText('Host Cafe')).toBeVisible();
});

test('guests may explore when the host guide has no published places', async ({ page }) => {
  await page.goto('/guest?empty');
  await expect(page.getByRole('button', { name: 'Explore nearby' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore nearby' }).click();
  await expect(page.getByLabel('Search nearby places')).toBeVisible();
});
