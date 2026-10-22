import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

/** The canvas's world size and the exit's height (GAME_CONSTANTS); the page stretches the canvas. */
const WORLD_W: number = 1280;
const WORLD_H: number = 720;
const EXIT_H: number = 32;
/** HUD_EXIT_SIGN_PX: the EXIT sign and arrows over the exit. */
const EXIT_SIGN_H: number = 64;
const FLOORS: number[] = [1, 2, 3, 4, 5, 6, 7, 8];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function rectOf(locator: Locator): Promise<Rect> {
  const box: Rect | null = await locator.boundingBox();
  expect(box, 'element is on the page').not.toBeNull();
  return box!;
}

/** The exit (and its sign above it, when `withSign`) in page px. */
async function exitRect(player: GamePlayer, s: E2eSnapshot, withSign: boolean): Promise<Rect> {
  const canvas: Rect = await rectOf(player.page.locator('app-game-canvas canvas'));
  const sx: number = canvas.width / WORLD_W;
  const sy: number = canvas.height / WORLD_H;
  const top: number = withSign ? s.exit.y - EXIT_SIGN_H : s.exit.y;
  return {
    x: canvas.x + s.exit.x * sx,
    y: canvas.y + top * sy,
    width: s.exit.width * sx,
    height: (s.exit.y + EXIT_H - top) * sy,
  };
}

test.describe('HUD layout', { tag: '@solo' }, (): void => {
  // The smallest common window: the HUD (page px) covers the most of the world here.
  test.use({ viewport: { width: 1280, height: 720 } });

  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
    // Unspent points show the HUD's point buttons; the warrior shows the skill bar.
    await player.probe.levelUp(5);
    await expect(player.page.getByTestId('hud-sp-button-open')).toBeVisible();
    await expect(player.page.getByTestId('hud-skill-bar')).toBeVisible();
  });

  test('no HUD plate, timer row or tray covers any floor exit', async (): Promise<void> => {
    await player.probe.activateSpecialDrop('super-speed');
    const plates: Locator[] = [
      player.page.getByTestId('hud-left-plate'),
      player.page.getByTestId('hud-right-plate'),
      player.page.locator('app-hud .wave-info'),
      player.page.locator('app-quick-slots .qs-container'),
    ];
    for (const floor of FLOORS) {
      await player.probe.setFloor(floor);
      const s: E2eSnapshot = await player.probe.waitFor(
        `floor ${floor}`,
        (st: E2eSnapshot): boolean => st.floor === floor,
      );
      const exit: Rect = await exitRect(player, s, false);
      for (const plate of plates) {
        expect(
          overlaps(await rectOf(plate), exit),
          `floor ${floor}: ${await plate.getAttribute('class')} over the exit`,
        ).toBe(false);
      }
    }
  });

  test('a plate over the exit sign turns see-through, and solid again once nothing is behind it', async (): Promise<void> => {
    const plates: Locator[] = [
      player.page.getByTestId('hud-left-plate'),
      player.page.getByTestId('hud-right-plate'),
    ];
    // The spring floor's exit hangs at the very top: its sign reaches up behind a plate.
    await player.probe.setFloor(3);
    const s: E2eSnapshot = await player.probe.waitFor(
      'floor 3',
      (st: E2eSnapshot): boolean => st.floor === 3,
    );
    const sign: Rect = await exitRect(player, s, true);
    let covered: number = 0;
    for (const plate of plates) {
      if (!overlaps(await rectOf(plate), sign)) continue;
      covered++;
      await expect(plate).toHaveClass(/hud-see-through/);
    }
    expect(covered, 'the sign reaches a plate on the spring floor').toBeGreaterThan(0);

    // Floor 1's exit is low and the player stands on the ground: every plate is solid.
    await player.probe.setFloor(1);
    await player.probe.waitFor('floor 1', (st: E2eSnapshot): boolean => st.floor === 1);
    for (const plate of plates) await expect(plate).not.toHaveClass(/hud-see-through/);
  });

  test('a special drop shows its timer in the HUD, above the quick slot tray', async (): Promise<void> => {
    await player.probe.activateSpecialDrop('super-speed');
    const timer: Locator = player.page.getByTestId('hud-special-super-speed');
    await expect(timer).toBeVisible();
    await expect(timer).toContainText(/\d+s/);
    const tray: Rect = await rectOf(player.page.locator('app-quick-slots .qs-container'));
    const box: Rect = await rectOf(timer);
    expect(box.y + box.height, 'the timer sits above the tray').toBeLessThanOrEqual(tray.y);
  });
});
