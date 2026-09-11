#!/usr/bin/env node
/**
 * capture-extra-shots.mjs
 *
 * Second-pass captures: the operations surfaces the first-pass script does
 * not cover. Exists so the landing arc and any future marketing slot can show
 * visibly distinct parts of the product instead of six crops of the same
 * light-themed screens.
 *
 * Captures, at the same two frames as capture-product-shots.mjs
 * (desktop 1600x900, mobile 390x844 @2x):
 *
 *   product-escalations   the escalations inbox — the urgent surface
 *   product-stays         the property inbox thread view (guest conversation)
 *   product-extras        extras requests with prices and statuses
 *   product-updates       the knowledge queue of AI-drafted updates
 *
 * Env is identical to the first-pass script: BASE_URL, DEMO_EMAIL,
 * DEMO_PASSWORD, and DEMO_PROPERTY_ID (the stays shot deep-links the property
 * inbox). Nothing here runs without the demo login.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT_DIR = join('public', 'premium');
const SETTLE_MS = 1200;

const FRAMES = [
  { name: 'desktop', width: 1600, height: 900 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
];

const EXTRA_SHOTS = [
  { surface: 'escalations', path: '/dashboard/escalations' },
  { surface: 'extras', path: '/dashboard/extras' },
  { surface: 'updates', path: '/dashboard/updates' },
  { surface: 'stays', path: (id) => `/dashboard/properties/${id}/inbox`, propertyScoped: true },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  const email = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first();
  const password = page.getByLabel(/password/i).or(page.locator('input[type="password"]')).first();
  await email.fill(process.env.DEMO_EMAIL);
  await password.fill(process.env.DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

async function firstPropertyId(page) {
  const href = await page
    .locator('a[href^="/dashboard/properties/"]')
    .first()
    .getAttribute('href');
  const match = href?.match(/\/dashboard\/properties\/([^/]+)/);
  return match?.[1] ?? null;
}

async function main() {
  if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD) {
    console.error('DEMO_EMAIL/DEMO_PASSWORD required — every surface here is host-side.');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const captured = [];

  for (const frame of FRAMES) {
    const context = await browser.newContext({
      viewport: { width: frame.width, height: frame.height },
      deviceScaleFactor: frame.deviceScaleFactor ?? 1,
    });
    const page = await context.newPage();

    await login(page);
    const propertyId = process.env.DEMO_PROPERTY_ID ?? (await firstPropertyId(page));

    for (const shot of EXTRA_SHOTS) {
      if (shot.propertyScoped && !propertyId) {
        console.warn(`no property id — skipping ${shot.surface}`);
        continue;
      }
      const path = shot.propertyScoped ? shot.path(propertyId) : shot.path;
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(SETTLE_MS);
      const file = `product-${shot.surface}-${frame.name}.png`;
      await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
      captured.push(file);
    }

    await context.close();
  }

  await browser.close();
  console.log(`captured ${captured.length} extra shot(s) into ${OUT_DIR}:`);
  for (const file of captured) console.log(`  ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
