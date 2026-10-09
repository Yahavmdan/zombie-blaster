// Screenshot one UI scene of the running dev server at 1280x720, to check a UI change by eye.
//
//   node tools/ui-shot.mjs <scene> [outDir]      (WEB_PORT env = dev server port, default 4200)
//
// Scenes: menu, help, charselect, lobby, hud, shop, inventory, stats, skills, settings.
// Prints the PNG path, plus any page errors. Uses installed Chrome (same default as the e2e suite).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'package.json'));
const { chromium } = require('playwright');

const scene = process.argv[2] ?? 'menu';
const outDir = resolve(process.argv[3] ?? resolve(root, 'e2e/.results/ui-shots'));
const base = `http://localhost:${process.env.WEB_PORT ?? '4200'}`;

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

async function pickClass(classId) {
  await page.getByTestId('charselect-name-input-name').fill('Tester');
  await page.getByTestId(`charselect-class-button-${classId}`).click();
  await page.getByTestId('charselect-nav-button-start').click();
}

async function startSolo() {
  await page.goto(`${base}/`);
  await page.getByTestId('menu-main-button-singleplayer').click();
  await pickClass('warrior');
  await page.waitForSelector('app-hud', { timeout: 20000 });
  await page.waitForTimeout(2500);
}

async function openInGame(key) {
  await startSolo();
  await page.keyboard.press(key);
  await page.waitForTimeout(600);
}

const scenes = {
  menu: async () => {
    await page.goto(`${base}/`);
    await page.waitForTimeout(1200);
  },
  help: async () => {
    await page.goto(`${base}/`);
    await page.getByTestId('menu-main-button-howtoplay').click();
    await page.waitForTimeout(600);
  },
  charselect: async () => {
    await page.goto(`${base}/`);
    await page.getByTestId('menu-main-button-singleplayer').click();
    await page.getByTestId('charselect-class-button-mage').click();
    await page.waitForTimeout(800);
  },
  lobby: async () => {
    await page.goto(`${base}/`);
    await page.getByTestId('menu-main-button-multiplayer').click();
    await page.waitForTimeout(800);
    if (page.url().includes('character-select')) await pickClass('ranger');
    await page.waitForTimeout(1500);
  },
  hud: startSolo,
  shop: () => openInGame('b'),
  inventory: () => openInGame('i'),
  stats: () => openInGame('p'),
  skills: () => openInGame('o'),
  settings: async () => {
    await startSolo();
    await page.getByTestId('game-settings-button-toggle').click();
    await page.waitForTimeout(600);
  },
};

if (!scenes[scene]) {
  console.error(`unknown scene "${scene}"; one of: ${Object.keys(scenes).join(', ')}`);
  process.exit(1);
}
await scenes[scene]();
mkdirSync(outDir, { recursive: true });
const file = resolve(outDir, `${scene}.png`);
await page.screenshot({ path: file });
process.stdout.write(`${file}\n`);
if (errors.length) process.stdout.write(`PAGE ERRORS:\n${errors.join('\n')}\n`);
await browser.close();
