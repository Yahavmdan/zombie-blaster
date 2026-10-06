import {
  Browser,
  BrowserContext,
  CDPSession,
  ConsoleMessage,
  Locator,
  Page,
  TestInfo,
  expect,
} from '@playwright/test';
import { GameProbe } from './probe';
import { NetMonitor } from './net-monitor';

export type ClassId = 'warrior' | 'ranger' | 'mage' | 'assassin' | 'priest';

export const ALL_CLASSES: ClassId[] = ['warrior', 'ranger', 'mage', 'assassin', 'priest'];

/** Default key bindings (shared/game-constants.ts DEFAULT_KEY_BINDINGS), as Playwright key names. */
export const KEYS: {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
  attack: string;
  revive: string;
  carry: string;
  openStats: string;
  openSkills: string;
  openShop: string;
  openInventory: string;
  hpPotion: string;
  mpPotion: string;
} = {
  left: 'a',
  right: 'd',
  up: 'w',
  down: 's',
  jump: ' ',
  attack: 'j',
  revive: 'f',
  carry: 'e',
  openStats: 'p',
  openSkills: 'o',
  openShop: 'b',
  openInventory: 'i',
  hpPotion: '7',
  mpPotion: '8',
};

declare global {
  interface Window {
    /** Every WebSocket the page opened (installed by GamePlayer's init script). */
    __zbSockets?: WebSocket[];
  }
}

/** Records every WebSocket the app opens so tests can simulate a dropped connection. */
function trackSocketsInitScript(): void {
  const NativeWebSocket: typeof WebSocket = window.WebSocket;
  const sockets: WebSocket[] = [];
  window.__zbSockets = sockets;
  class TrackedWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      sockets.push(this);
    }
  }
  window.WebSocket = TrackedWebSocket;
}

/** Console noise that is not a game bug (asset 404s during hot reload, reconnect logs, ...). */
const IGNORED_CONSOLE_ERRORS: RegExp[] = [
  /favicon\.ico/i,
  /\[vite\]/i,
  /Failed to load resource.*\.map/i,
];

export interface OpenPlayerOptions {
  name: string;
  classId: ClassId;
  /** Frontend origin for this player (e.g. a second dev server port). Defaults to config baseURL. */
  baseUrl?: string;
  /** null = follow the window size (headed demo windows). */
  viewport?: { width: number; height: number } | null;
}

export interface WindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * One human-like player: an isolated browser context + page, a probe into the game,
 * a network monitor and an error collector. All tests drive the game through this.
 */
export class GamePlayer {
  readonly probe: GameProbe;
  readonly net: NetMonitor;
  readonly errors: string[] = [];
  private readonly heldKeys: Set<string> = new Set<string>();

  private constructor(
    readonly context: BrowserContext,
    readonly page: Page,
    readonly name: string,
    readonly classId: ClassId,
  ) {
    this.probe = new GameProbe(page);
    this.net = new NetMonitor(page);
    page.on('pageerror', (err: Error): void => {
      this.errors.push(`pageerror: ${err.message}`);
    });
    page.on('console', (msg: ConsoleMessage): void => {
      if (msg.type() !== 'error') return;
      const text: string = msg.text();
      if (IGNORED_CONSOLE_ERRORS.some((re: RegExp): boolean => re.test(text))) return;
      this.errors.push(`console.error: ${text}`);
    });
  }

  static async open(browser: Browser, options: OpenPlayerOptions): Promise<GamePlayer> {
    const context: BrowserContext = await browser.newContext({
      viewport: options.viewport === undefined ? { width: 1280, height: 800 } : options.viewport,
      ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    });
    await context.addInitScript(trackSocketsInitScript);
    const page: Page = await context.newPage();
    return new GamePlayer(context, page, options.name, options.classId);
  }

  // ── Navigation ──────────────────────────────────────────

  async gotoMenu(): Promise<void> {
    await this.page.goto('/');
    await this.failOnDevServerError();
    await expect(this.page.getByTestId('menu-main-button-singleplayer')).toBeVisible();
  }

  private async pickCharacter(): Promise<void> {
    await this.page.getByTestId('charselect-name-input-name').fill(this.name);
    await this.page.getByTestId(`charselect-class-button-${this.classId}`).click();
    await this.page.getByTestId('charselect-nav-button-start').click();
  }

  /**
   * A dev server that caught a half-saved edit shows a compile-error overlay that swallows
   * every click. Fail fast with the error text instead of hanging (fix: re-save/touch the file).
   */
  async failOnDevServerError(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(300);
    const overlay: string | null = await this.page.evaluate((): string | null => {
      const el: Element | null = document.querySelector('vite-error-overlay');
      return el ? (el.shadowRoot?.textContent ?? 'compile error').trim().slice(0, 400) : null;
    });
    if (overlay)
      throw new Error(`${this.name}: dev server shows a compile error overlay: ${overlay}`);
  }

  /** Menu → New Game → character select → game page with the probe ready. */
  async startSolo(): Promise<void> {
    await this.gotoMenu();
    await this.page.getByTestId('menu-main-button-singleplayer').click();
    await this.pickCharacter();
    await this.page.waitForURL(/\/game/);
    await this.probe.waitForReady();
  }

  /** Menu → Multiplayer → character select → lobby (connected). */
  async enterLobby(): Promise<void> {
    await this.gotoMenu();
    await this.page.getByTestId('menu-main-button-multiplayer').click();
    await this.pickCharacter();
    await this.page.waitForURL(/\/lobby/);
    await expect(this.page.getByTestId('lobby-create-button-create')).toBeEnabled({
      timeout: 15_000,
    });
  }

  async createRoom(roomName: string): Promise<void> {
    await this.page.getByTestId('lobby-create-input-roomname').fill(roomName);
    await this.page.getByTestId('lobby-create-button-create').click();
    await expect(this.page.getByTestId('lobby-room-button-start')).toBeVisible();
  }

  roomCard(roomName: string): Locator {
    return this.page.locator('.room-card').filter({ hasText: roomName });
  }

  async joinRoom(roomName: string): Promise<void> {
    await expect(async (): Promise<void> => {
      await this.page.getByTestId('lobby-rooms-button-refresh').click();
      await expect(this.roomCard(roomName)).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await this.roomCard(roomName).locator('.btn--join').click();
  }

  async toggleReady(): Promise<void> {
    await this.page.getByTestId('lobby-room-button-ready').click();
  }

  // ── Input ───────────────────────────────────────────────

  async hold(key: string): Promise<void> {
    if (this.heldKeys.has(key)) return;
    this.heldKeys.add(key);
    await this.page.keyboard.down(key);
  }

  async release(key: string): Promise<void> {
    if (!this.heldKeys.has(key)) return;
    this.heldKeys.delete(key);
    await this.page.keyboard.up(key);
  }

  isHolding(key: string): boolean {
    return this.heldKeys.has(key);
  }

  async releaseAll(): Promise<void> {
    for (const key of [...this.heldKeys]) {
      await this.release(key);
    }
  }

  /** Holds a key for `ms` of wall time. The engine samples keys every 20 ms tick. */
  async press(key: string, ms: number = 80): Promise<void> {
    await this.hold(key);
    await this.page.waitForTimeout(ms);
    await this.release(key);
  }

  async moveRight(ms: number): Promise<void> {
    await this.press(KEYS.right, ms);
  }

  async moveLeft(ms: number): Promise<void> {
    await this.press(KEYS.left, ms);
  }

  async jump(): Promise<void> {
    await this.press(KEYS.jump, 120);
  }

  async attack(): Promise<void> {
    await this.press(KEYS.attack, 80);
  }

  /** Skill slot 1..6 (usable skills sorted by required level). */
  async castSkill(slot: number): Promise<void> {
    await this.press(String(slot), 80);
  }

  async face(direction: 'left' | 'right'): Promise<void> {
    await this.press(direction === 'left' ? KEYS.left : KEYS.right, 30);
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  // ── Network ─────────────────────────────────────────────

  /**
   * Closes the game-server socket as if the network dropped; the app should auto-reconnect.
   * Sockets to the page's own host (dev-server live reload) are left alone.
   */
  async dropConnection(): Promise<void> {
    await this.page.evaluate((): void => {
      for (const ws of window.__zbSockets ?? []) {
        const isGameSocket: boolean = new URL(ws.url).host !== location.host;
        if (isGameSocket && ws.readyState === WebSocket.OPEN)
          ws.close(4000, 'e2e: simulated network drop');
      }
    });
  }

  async openGameSocketCount(): Promise<number> {
    return this.page.evaluate(
      (): number =>
        (window.__zbSockets ?? []).filter(
          (ws: WebSocket): boolean =>
            new URL(ws.url).host !== location.host && ws.readyState === WebSocket.OPEN,
        ).length,
    );
  }

  // ── Evidence ────────────────────────────────────────────

  /** Attaches a screenshot of the game canvas to the test report. */
  async attachCanvas(testInfo: TestInfo, label: string): Promise<void> {
    const canvas: Locator = this.page.locator('canvas').first();
    const png: Buffer = await canvas.screenshot();
    await testInfo.attach(`${this.name}: ${label}`, { body: png, contentType: 'image/png' });
  }

  async attachNetSummary(testInfo: TestInfo, label: string): Promise<void> {
    await testInfo.attach(`${this.name}: ${label}`, {
      body: JSON.stringify(this.net.summary(), null, 2),
      contentType: 'application/json',
    });
  }

  /** Headed runs only: moves/resizes this player's browser window (Chromium CDP) and raises it. */
  async placeWindow(bounds: WindowBounds): Promise<void> {
    const session: CDPSession = await this.context.newCDPSession(this.page);
    const target: { windowId: number } = (await session.send('Browser.getWindowForTarget')) as {
      windowId: number;
    };
    await session.send('Browser.setWindowBounds', {
      windowId: target.windowId,
      bounds: { windowState: 'normal' },
    });
    await session.send('Browser.setWindowBounds', { windowId: target.windowId, bounds });
    await session.detach();
    await this.page.bringToFront();
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}
