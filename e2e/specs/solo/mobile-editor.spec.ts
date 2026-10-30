import { CDPSession, Locator, Page } from '@playwright/test';
import { test, expect, PhoneFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { pagePoint } from '../../support/dev-tools';

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

/** A real finger: raw touch events (Playwright's touchscreen only taps). */
class Finger {
  private constructor(private readonly cdp: CDPSession) {}

  static async on(page: Page): Promise<Finger> {
    return new Finger(await page.context().newCDPSession(page));
  }

  async down(at: Point): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  }

  async move(at: Point): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at] });
  }

  async up(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async tap(at: Point): Promise<void> {
    await this.down(at);
    await this.up();
  }

  /** Presses, slides in steps and lets go. */
  async drag(from: Point, to: Point): Promise<void> {
    await this.down(from);
    const steps: number = 10;
    for (let i: number = 1; i <= steps; i++) {
      await this.move({
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
    }
    await this.up();
  }

  /** Keeps a finger on an element for `ms`. */
  async hold(target: Locator, ms: number): Promise<void> {
    await this.down(await centerOf(target));
    await target.page().waitForTimeout(ms);
    await this.up();
  }
}

/** Where a finger lands on an element (scrolled into view first: the tool window scrolls). */
async function centerOf(target: Locator): Promise<Point> {
  await expect(target).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  const box: Box | null = await target.boundingBox();
  expect(box, 'element is on screen').not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

function platformAround(s: E2eSnapshot, x: number, y: number): Box | undefined {
  return s.level.platforms.find(
    (pl: Box): boolean => x >= pl.x && x <= pl.x + pl.width && y >= pl.y && y <= pl.y + pl.height,
  );
}

/** Opens the tool window from the rail and picks a tool there (the window goes away). */
async function pickFromDrawer(page: Page, finger: Finger, tool: string): Promise<void> {
  await finger.tap(await centerOf(page.getByTestId('level-editor-rail-button-tools')));
  await expect(page.getByTestId('level-editor-panel-window')).toBeVisible();
  await finger.tap(await centerOf(page.getByTestId(`level-editor-tool-${tool}`)));
  await expect(page.getByTestId('level-editor-panel-window')).toBeHidden();
}

/** Empties the floor (only the exit stays) from the tool window, and clears the zombies. */
async function clearFloor(p: GamePlayer, finger: Finger): Promise<void> {
  await p.probe.clearZombies();
  await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-button-tools')));
  await finger.tap(await centerOf(p.page.getByTestId('level-editor-button-clear')));
  await finger.tap(await centerOf(p.page.getByTestId('level-editor-button-close')));
  await expect(p.page.getByTestId('level-editor-panel-window')).toBeHidden();
}

test.describe('mobile level editor', { tag: '@solo' }, (): void => {
  test('a phone opening the site lands in the editor: god mode, no HUD, the map beside the rail', async ({
    phone,
  }: {
    phone: PhoneFactory;
  }): Promise<void> => {
    const p: GamePlayer = await phone();
    await expect(p.page).toHaveURL(/\/mobile-editor$/);
    await expect(p.page.getByTestId('level-editor-rail')).toBeVisible();
    await expect(p.page.getByTestId('level-editor-panel-window')).toBeHidden();
    await expect(p.page.locator('app-hud')).toHaveCount(0);
    await expect(p.page.getByTestId('game-dev-button-toggle-dialog')).toHaveCount(0);
    await expect(p.page.getByTestId('mobile-editor-overlay-turn')).toBeHidden();
    expect((await p.probe.state()).godMode, 'dev play-tests in god mode').toBe(true);

    const rail: Box | null = await p.page.getByTestId('level-editor-rail').boundingBox();
    const map: Box | null = await p.page.locator('app-game-canvas canvas').boundingBox();
    expect(map!.x, 'the rail covers no map').toBeGreaterThanOrEqual(rail!.x + rail!.width - 1);
    expect(map!.x + map!.width).toBeCloseTo(844, 0);

    // Held upright the map would be squashed: the page asks to turn the phone.
    await p.page.setViewportSize({ width: 390, height: 844 });
    await expect(p.page.getByTestId('mobile-editor-overlay-turn')).toBeVisible();
  });

  test('build with a finger: tap places, drag moves, the erase tool takes away, undo brings back', async ({
    phone,
  }: {
    phone: PhoneFactory;
  }): Promise<void> => {
    const p: GamePlayer = await phone();
    const finger: Finger = await Finger.on(p.page);
    await clearFloor(p, finger);

    await pickFromDrawer(p.page, finger, 'platform');
    await finger.tap(await pagePoint(p.page, 800, 300));
    await p.probe.waitFor(
      'the tapped platform is collision at once',
      (s: E2eSnapshot): boolean => platformAround(s, 800, 300) !== undefined,
      { timeoutMs: 5_000 },
    );

    await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-tool-select')));
    await finger.drag(await pagePoint(p.page, 800, 300), await pagePoint(p.page, 960, 220));
    await p.probe.waitFor(
      'it moved with the finger',
      (s: E2eSnapshot): boolean =>
        platformAround(s, 960, 220) !== undefined && platformAround(s, 800, 300) === undefined,
      { timeoutMs: 5_000 },
    );

    await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-tool-erase')));
    await finger.tap(await pagePoint(p.page, 960, 220));
    await p.probe.waitFor('erased', (s: E2eSnapshot): boolean => s.level.platforms.length === 0, {
      timeoutMs: 5_000,
    });

    await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-button-undo')));
    await p.probe.waitFor(
      'undo puts it back',
      (s: E2eSnapshot): boolean => platformAround(s, 960, 220) !== undefined,
      { timeoutMs: 5_000 },
    );
  });

  test('Adjust opens the popup a middle click opens on a PC', async ({
    phone,
  }: {
    phone: PhoneFactory;
  }): Promise<void> => {
    const p: GamePlayer = await phone();
    const finger: Finger = await Finger.on(p.page);
    await clearFloor(p, finger);
    await expect(p.page.getByTestId('level-editor-rail-button-adjust')).toBeDisabled();

    await pickFromDrawer(p.page, finger, 'slingshot');
    await finger.tap(await pagePoint(p.page, 600, 600));
    await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-button-adjust')));
    const popup: Locator = p.page.getByTestId('level-editor-panel-props');
    await expect(popup).toBeVisible();
    await expect(popup.getByTestId('level-editor-text-props-title')).toHaveText(/Slingshot/);
    await expect(popup.getByTestId('level-editor-props-range-angle')).toBeVisible();
  });

  test('Play: the touch pad walks and jumps the player, Build hands the map back', async ({
    phone,
  }: {
    phone: PhoneFactory;
  }): Promise<void> => {
    const p: GamePlayer = await phone();
    const finger: Finger = await Finger.on(p.page);
    await clearFloor(p, finger);
    await expect(p.page.getByTestId('touch-controls-button-right')).toHaveCount(0);

    await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-button-mode')));
    await expect(p.page.getByTestId('touch-controls-button-right')).toBeVisible();
    await expect(p.page.getByTestId('level-editor-rail-button-mode')).toHaveText('Build');

    await p.probe.teleport(400, 500);
    const start: E2eSnapshot = await p.probe.waitFor(
      'standing on the ground',
      (s: E2eSnapshot): boolean => s.player?.isGrounded === true,
      { timeoutMs: 5_000 },
    );
    await finger.hold(p.page.getByTestId('touch-controls-button-right'), 500);
    const walked: E2eSnapshot = await p.probe.state();
    expect(walked.player!.x - start.player!.x, 'held right walks right').toBeGreaterThan(40);

    // A tap on the map while playing builds nothing.
    const platforms: number = walked.level.platforms.length;
    await finger.tap(await pagePoint(p.page, 700, 300));

    await finger.hold(p.page.getByTestId('touch-controls-button-jump'), 150);
    await p.probe.waitFor(
      'the jump button jumps',
      (s: E2eSnapshot): boolean => s.player!.y < walked.player!.y - 30,
      { timeoutMs: 3_000, intervalMs: 20 },
    );
    expect((await p.probe.state()).level.platforms.length).toBe(platforms);

    await finger.tap(await centerOf(p.page.getByTestId('level-editor-rail-button-mode')));
    await expect(p.page.getByTestId('touch-controls-button-right')).toHaveCount(0);
    await expect(p.page.getByTestId('level-editor-rail-button-tools')).toBeVisible();
  });
});
