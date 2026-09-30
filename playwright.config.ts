import { defineConfig, PlaywrightTestConfig } from '@playwright/test';
import { e2eEnv } from './e2e/support/env';

type WebServerConfig = NonNullable<PlaywrightTestConfig['webServer']>;

const localServers: WebServerConfig = [
  {
    command: 'npm run dev',
    cwd: './zombie-blaster-api',
    url: 'http://localhost:3001',
    reuseExistingServer: !e2eEnv.isCi,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: !e2eEnv.isCi,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
];

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './e2e/.results',
  snapshotPathTemplate: '{testDir}/__baselines__/{testFilePath}/{arg}-{platform}{ext}',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  updateSnapshots: 'missing',
  fullyParallel: false,
  forbidOnly: e2eEnv.isCi,
  retries: e2eEnv.isCi ? 1 : 0,
  workers: e2eEnv.workers,
  reporter: [['list'], ['html', { open: 'never', outputFolder: './e2e/.report' }]],
  use: {
    baseURL: e2eEnv.baseUrl,
    channel: e2eEnv.channel,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { slowMo: e2eEnv.slowMo },
  },
  webServer: e2eEnv.isExternal ? undefined : localServers,
});
