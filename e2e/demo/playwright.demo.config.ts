import { defineConfig } from '@playwright/test';
import { e2eEnv } from '../support/env';

/**
 * Watchable demo: two headed Chrome windows side by side, each on its own frontend port,
 * playing one online game together. Not part of the test suite (`npm run e2e:demo`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.demo.ts',
  outputDir: '../.results/demo',
  timeout: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    channel: e2eEnv.channel,
    headless: false,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: [
    {
      command: 'npm run dev',
      cwd: '../../zombie-blaster-api',
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx ng serve --port 4200',
      cwd: '../..',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: 'npx ng serve --port 4201',
      cwd: '../..',
      url: 'http://localhost:4201',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
