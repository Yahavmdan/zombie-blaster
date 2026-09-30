/**
 * Environment switches for the e2e suite. Everything is optional; defaults run
 * against the local dev servers that `playwright.config.ts` starts itself.
 *
 * E2E_BASE_URL   Frontend under test. Set it to test a deployed/staging build ("online" mode);
 *                the config then starts no local servers.
 * E2E_WS_URL     Game server for raw-protocol tests. Defaults to the local server.
 * E2E_CHANNEL    Browser channel: `chrome` (installed Chrome, default), `msedge`, or `chromium`
 *                (Playwright's bundled build; needs `npx playwright install chromium`).
 * E2E_WORKERS    Parallel workers. Every page runs a full 50 tps game loop, so keep it low.
 * E2E_SLOWMO     Milliseconds between Playwright actions, for watching a headed run.
 */

function readString(name: string, fallback: string): string {
  const value: string | undefined = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

function readInt(name: string, fallback: number): number {
  const parsed: number = parseInt(process.env[name] ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const channelSetting: string = readString('E2E_CHANNEL', 'chrome');

export const e2eEnv: {
  baseUrl: string;
  wsUrl: string;
  isExternal: boolean;
  channel: string | undefined;
  workers: number;
  slowMo: number;
  isCi: boolean;
} = {
  baseUrl: readString('E2E_BASE_URL', 'http://localhost:4200'),
  wsUrl: readString('E2E_WS_URL', 'ws://localhost:3001'),
  isExternal: (process.env['E2E_BASE_URL'] ?? '').trim() !== '',
  channel: channelSetting === 'chromium' ? undefined : channelSetting,
  workers: readInt('E2E_WORKERS', 2),
  slowMo: readInt('E2E_SLOWMO', 0),
  isCi: (process.env['CI'] ?? '') !== '',
};
