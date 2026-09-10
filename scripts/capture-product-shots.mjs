#!/usr/bin/env node
/**
 * capture-product-shots.mjs
 *
 * Produces the product screenshots the marketing pages ship, so the articles
 * show the real product rather than stock photography.
 *
 * What it does:
 *   1. Opens a production build (BASE_URL, default http://localhost:3000) in
 *      Chromium at two fixed frames:
 *        desktop 1600x900  (16:9 — the PageHero frame the articles use)
 *        mobile  390x844 @ 2x DPR (iPhone 13-class, sharp on retina)
 *   2. Captures the public marketing surfaces unconditionally.
 *   3. If DEMO_EMAIL + DEMO_PASSWORD are set, logs in once and captures the
 *      host-side surfaces too: dashboard overview, Property Brain, go-live
 *      readiness, Local Recs, and (when PORTAL_URL is provided) the live
 *      guest portal.
 *
 * Output: public/premium/product-<surface>-<frame>.png — committed assets.
 * The article pages import them like any other premium image; regenerating
 * and committing the diff is the whole update path when the UI changes.
 *
 * Prerequisites:
 *   npx playwright install chromium
 *   npm run build && npm run start   (or point BASE_URL at a preview deploy)
 *
 * Env:
 *   BASE_URL          default http://localhost:3000
 *   DEMO_EMAIL        demo host account (screenshots show demo data only)
 *   DEMO_PASSWORD
 *   DEMO_PROPERTY_ID  first property id to deep-link (defaults to /dashboard's
 *                     first property link)
 *   PORTAL_URL        optional live guest portal URL (host preview or a real
 *                     guest link) for the guest-side captures
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const OUT_DIR = join('public', 'premium');
const SETTLE_MS = 1200;

const FRAMES = [
  { name: 'desktop', width: 1600, height: 900 },
  // deviceScaleFactor 2 keeps text crisp when these are embedded at 16:9 on
  // the articles and in the Related cards.
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
];

const PUBLIC_SHOTS = [
  { surface: 'landing', path: '/' },
  { surface: 'how-it-works', path: '/how-it-works' },
  { surface: 'guest-experience', path: '/guest-experience' },
];

// Host-side surfaces, in the order a host meets them. DEMO_PROPERTY_ID, when
// set, deep-links a specific property; otherwise the script uses whatever the
// dashboard's first property card points at.
const AUTHED_SHOTS = [
  { surface: 'dashboard', path: '/dashboard', propertyScoped: false },
  { surface: 'brain', path: (id) => `/dashboard/properties/${id}/brain`, propertyScoped: true },
  { surface: 'go-live', path: (id) => `/dashboard/properties/${id}/brain/go-live`, propertyScoped: true },
  { surface: 'local-recs', path: (id) => `/dashboard/properties/${id}/local`, propertyScoped: true },
];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  // Label first, input-type fallback — the login form's own labels win when
  // they exist, and the type fallback covers a label-less redesign without
  // the script having to change.
  const email = page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first();
  const password = page.getByLabel(/password/i).or(page.locator('input[type="password"]')).first();
  await email.fill(process.env.DEMO_EMAIL);
  await password.fill(process.env.DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

async function firstPropertyId(page) {
  // The dashboard property cards link to /dashboard/properties/<id>; the first
  // one is the demo property.
  const href = await page
    .locator('a[href^="/dashboard/properties/"]')
    .first()
    .getAttribute('href');
  const match = href?.match(/\/dashboard\/properties\/([^/]+)/);
  return match?.[1] ?? null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const captured = [];

  for (const frame of FRAMES) {
    const context = await browser.newContext({
      viewport: { width: frame.width, height: frame.height },
      deviceScaleFactor: frame.deviceScaleFactor ?? 1,
    });
    const page = await context.newPage();

    for (const shot of PUBLIC_SHOTS) {
      await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(SETTLE_MS);
      const file = `product-${shot.surface}-${frame.name}.png`;
      await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
      captured.push(file);
    }

    if (process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD) {
      await login(page);
      const propertyId = process.env.DEMO_PROPERTY_ID ?? (await firstPropertyId(page));
      if (!propertyId) {
        console.warn('demo account has no property; host surfaces skipped. Seed one and rerun.');
      } else {
        for (const shot of AUTHED_SHOTS) {
          const path = shot.propertyScoped ? shot.path(propertyId) : shot.path;
          await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(SETTLE_MS);
          const file = `product-${shot.surface}-${frame.name}.png`;
          await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
          captured.push(file);
        }
      }
    } else {
      console.log('DEMO_EMAIL/DEMO_PASSWORD not set — host-side surfaces skipped.');
    }

    if (process.env.PORTAL_URL) {
      await page.goto(process.env.PORTAL_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(SETTLE_MS);
      const file = `product-portal-${frame.name}.png`;
      await page.screenshot({ path: join(OUT_DIR, file), fullPage: false });
      captured.push(file);
    }

    await context.close();
  }

  await browser.close();
  console.log(`captured ${captured.length} shot(s) into ${OUT_DIR}:`);
  for (const file of captured) console.log(`  ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
