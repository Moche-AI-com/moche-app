import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:3219', headless: true },
  webServer: { command: 'node test/local-recs-ui/harness.mjs', cwd: resolve(__dirname, '../..'), url: 'http://127.0.0.1:3219', reuseExistingServer: false },
});
