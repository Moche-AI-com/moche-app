import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.ts', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3220' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'node test/messaging-ui/harness.mjs', cwd: path.resolve(__dirname, '../..'), port: 3220, reuseExistingServer: false },
  outputDir: '../../test-results/messaging-ui',
});
