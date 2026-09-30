import { defineConfig } from '@playwright/test';
import { e2eEnv } from '../support/env';

/**
 * Playtest lab: experiments that measure how the game plays (not pass/fail tests).
 * Each experiment writes findings to e2e/.results/lab/findings.jsonl and attaches evidence.
 * `npm run e2e:lab` (all) or `npm run e2e:lab -- -g "rope"` (one).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.lab.ts',
  outputDir: '../.results/lab-runs',
  timeout: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../.report-lab' }]],
  use: {
    baseURL: e2eEnv.baseUrl,
    channel: e2eEnv.channel,
    headless: true,
    viewport: { width: 1280, height: 800 },
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
      command: 'npm start',
      cwd: '../..',
      url: 'http://localhost:4200',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
