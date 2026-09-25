import { expect, test } from '@playwright/test';

test('portal controls remain readable in dark and light theme', async ({ page }) => {
  await page.goto('/portal-fixture');
  for (const selector of ['#portal-input', '#portal-composer']) {
    const dark = await page.locator(selector).evaluate((el) => {
      const css = getComputedStyle(el);
      return { text: css.webkitTextFillColor, caret: css.caretColor };
    });
    expect(dark.text).toBe('rgb(242, 245, 244)');
    expect(dark.caret).not.toBe(dark.text);
  }
  await page.locator('.gp-v2').evaluate((el) => el.classList.add('gp-light'));
  for (const selector of ['#portal-input', '#portal-composer']) {
    const light = await page.locator(selector).evaluate((el) => getComputedStyle(el).webkitTextFillColor);
    expect(light).toBe('rgb(21, 32, 25)');
  }
});

test('card dialog is visible and internally scrollable without page scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile viewport assertion');
  await page.goto('/portal-fixture');
  await page.locator('.gp-modal-body > div').evaluate((el) => { (el as HTMLElement).style.height = '1600px'; });
  await page.locator('#open-card').click();
  await expect(page.getByRole('dialog', { name: 'Question card' })).toBeVisible();
  const rect = await page.locator('.gp-modal').boundingBox();
  const viewport = page.viewportSize();
  expect(rect).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport!.height + 1);
  const scrolls = await page.locator('.gp-modal-body').evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(scrolls).toBe(true);
  await page.locator('#close-card').click();
  await expect(page.getByRole('dialog', { name: 'Question card' })).toBeHidden();
});
