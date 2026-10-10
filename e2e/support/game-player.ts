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
import type { E2eLightningView } from './probe';
import { NetMonitor } from './net-monitor';

export type ClassId = 'warrior' | 'ranger' | 'mage' | 'assassin' | 'priest';

/** Sky brightness on one screen, and the lightning strike lighting it when measured during one. */
export interface SkyLuma {
  luma: number;
  strike: E2eLightningView | null;
}

export const ALL_CLASSES: ClassId[] = ['warrior', 'ranger', 'mage', 'assassin', 'priest'];

/** Default keys of skill slots 1..7 (shared/game-constants.ts DEFAULT_KEY_BINDINGS skill1..skill7). */
export const SKILL_SLOT_KEYS: string[] = ['1', '2', '3', '4', '5', '6', '9'];

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
    /** Switches the page between a foreground and a background tab (GamePlayer's init script). */
    __zbBackgroundTab?: (hidden: boolean) => void;
  }
}

/**
 * Lets tests put a page in the background like a real browser tab. Playwright keeps every page
 * visible (no tab switch, minimize or launch flag changes that), so this does what Chrome does to
 * a hidden tab: window blur, document.hidden + visibilitychange, no animation frames, main-thread timers
 * wake at most once a second. Worker timers and messages keep running, as in Chrome.
 */
function backgroundTabInitScript(): void {
  let hidden: boolean = false;
  const nativeRaf: (cb: FrameRequestCallback) => number = window.requestAnimationFrame.bind(window);
  const nativeCancelRaf: (id: number) => void = window.cancelAnimationFrame.bind(window);
  const nativeSetInterval: typeof window.setInterval = window.setInterval.bind(window);
  const nativeSetTimeout: typeof window.setTimeout = window.setTimeout.bind(window);
  const parked: Map<number, FrameRequestCallback> = new Map<number, FrameRequestCallback>();
  let nextParkedId: number = -1;

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    if (!hidden) return nativeRaf(cb);
    const id: number = nextParkedId--;
    parked.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    if (!parked.delete(id)) nativeCancelRaf(id);
  };
  window.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]): number => {
    let lastHiddenRun: number = 0;
    return nativeSetInterval((): void => {
      if (hidden) {
        const now: number = performance.now();
        if (now - lastHiddenRun < 1000) return;
        lastHiddenRun = now;
      }
      if (typeof handler === 'function') (handler as (...a: unknown[]) => void)(...args);
    }, ms);
  }) as typeof window.setInterval;
  window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]): number =>
    nativeSetTimeout(handler, hidden ? Math.max(ms ?? 0, 1000) : ms, ...args)) as typeof window.setTimeout;
  Object.defineProperty(document, 'hidden', { configurable: true, get: (): boolean => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: (): DocumentVisibilityState => (hidden ? 'hidden' : 'visible'),
  });

  window.__zbBackgroundTab = (h: boolean): void => {
    if (h === hidden) return;
    hidden = h;
    if (!hidden) {
      const resumed: FrameRequestCallback[] = [...parked.values()];
      parked.clear();
      for (const cb of resumed) nativeRaf(cb);
    }
    window.dispatchEvent(new Event(hidden ? 'blur' : 'focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  };
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
    await context.addInitScript(backgroundTabInitScript);
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

  /** Presses the default key of skill slot 1..7 (DEFAULT_KEY_BINDINGS: 1-6, then 9; 7/8 are potions). */
  async castSkill(slot: number): Promise<void> {
    await this.press(SKILL_SLOT_KEYS[slot - 1], 80);
  }

  async face(direction: 'left' | 'right'): Promise<void> {
    await this.press(direction === 'left' ? KEYS.left : KEYS.right, 30);
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  // ── Network ─────────────────────────────────────────────

  /** Puts this tab behind another one (as when the player opens a new tab) or brings it back. */
  async setBackgroundTab(hidden: boolean): Promise<void> {
    await this.page.evaluate((h: boolean): void => window.__zbBackgroundTab?.(h), hidden);
  }

  /**
   * Closes the game-server socket as if the network dropped; the app should auto-reconnect.
   * The game socket is on another host (deployed) or on the dev server's `/ws` proxy; the dev
   * server's own live-reload socket is left alone.
   */
  async dropConnection(): Promise<void> {
    await this.page.evaluate((): void => {
      for (const ws of window.__zbSockets ?? []) {
        const url: URL = new URL(ws.url);
        const isGameSocket: boolean = url.host !== location.host || url.pathname === '/ws';
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
            (new URL(ws.url).host !== location.host || new URL(ws.url).pathname === '/ws') &&
            ws.readyState === WebSocket.OPEN,
        ).length,
    );
  }

  /**
   * Mean luminance (0-255) of the game canvas rows `y0`..`y1`. With `duringStrike`, it first waits
   * (in the page, frame by frame) for a lightning strike on this screen and measures the frame
   * drawn after it; `strike` is the strike as that screen had it (null without `duringStrike`).
   */
  async canvasLuma(
    y0: number,
    y1: number,
    duringStrike: boolean = false,
    timeoutMs: number = 5_000,
  ): Promise<SkyLuma> {
    return this.page.evaluate(
      (args: [number, number, boolean, number]): Promise<SkyLuma> =>
        new Promise<SkyLuma>(
          (resolve: (v: SkyLuma) => void, reject: (e: Error) => void): void => {
            const top: number = args[0];
            const bottom: number = args[1];
            const timeout: number = args[3];
            const measure: () => number = (): number => {
              const canvas: HTMLCanvasElement = document.querySelector('canvas')!;
              const data: Uint8ClampedArray = canvas
                .getContext('2d')!
                .getImageData(0, top, canvas.width, bottom - top).data;
              let sum: number = 0;
              for (let i: number = 0; i < data.length; i += 4) {
                sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              }
              return sum / (data.length / 4);
            };
            if (!args[2]) {
              resolve({ luma: measure(), strike: null });
              return;
            }
            const deadline: number = performance.now() + timeout;
            const poll: () => void = (): void => {
              const strike: E2eLightningView | null = window.__zbE2e?.getState()?.vfx.lightning ?? null;
              if (strike) {
                requestAnimationFrame((): void => resolve({ luma: measure(), strike }));
              } else if (performance.now() > deadline) {
                reject(new Error('no lightning strike on this screen'));
              } else {
                requestAnimationFrame(poll);
              }
            };
            poll();
          },
        ),
      [y0, y1, duringStrike, timeoutMs] as [number, number, boolean, number],
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
