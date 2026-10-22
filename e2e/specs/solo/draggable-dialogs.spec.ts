import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragCase {
  name: string;
  open: (player: GamePlayer) => Promise<void>;
  /** The element carrying appDraggableDialog. */
  panel: string;
  /** The element that closes the dialog. */
  close: string;
  /** Uses a button in the moved dialog and checks that it did its job. */
  useButton: (player: GamePlayer) => Promise<void>;
}

const DRAG_X: number = 150;
const DRAG_Y: number = 80;

const CASES: DragCase[] = [
  {
    name: 'stats',
    open: async (player: GamePlayer): Promise<void> => {
      await player.probe.levelUp(1);
      await player.probe.waitFor(
        'stat points granted',
        (s: E2eSnapshot): boolean => s.player!.unallocatedStatPoints > 0,
      );
      await player.page.keyboard.press(KEYS.openStats);
    },
    panel: 'stat-allocation-panel-window',
    close: 'stat-allocation-button-close',
    useButton: async (player: GamePlayer): Promise<void> => {
      const before: E2eSnapshot = await player.probe.state();
      await player.page.getByTestId('stat-allocation-button-add-dex').click();
      await player.probe.waitFor(
        'stat point spent',
        (s: E2eSnapshot): boolean =>
          s.player!.unallocatedStatPoints === before.player!.unallocatedStatPoints - 1,
      );
    },
  },
  {
    name: 'skill tree',
    open: (player: GamePlayer): Promise<void> => player.page.keyboard.press(KEYS.openSkills),
    panel: 'tree-window',
    close: 'tree-close-button',
    useButton: async (player: GamePlayer): Promise<void> => {
      const nodes: Locator = player.page.locator('[data-testid^="tree-node-"]');
      const detailName: Locator = player.page.getByTestId('tree-detail-name');
      await nodes.nth(0).click();
      const first: string = (await detailName.textContent()) ?? '';
      await nodes.nth(1).click();
      await expect(detailName, 'clicking a node selects it').not.toHaveText(first);
    },
  },
  {
    name: 'shop',
    open: (player: GamePlayer): Promise<void> => player.page.keyboard.press(KEYS.openShop),
    panel: 'shop-panel-window',
    close: 'shop-panel-button-close',
    useButton: async (player: GamePlayer): Promise<void> => {
      await player.page.getByTestId('shop-item-button-qty-plus-shop-hp-potion-1').click();
      await expect(player.page.getByTestId('shop-item-input-qty-shop-hp-potion-1')).toHaveValue(
        '2',
      );
    },
  },
  {
    name: 'inventory',
    open: (player: GamePlayer): Promise<void> => player.page.keyboard.press(KEYS.openInventory),
    panel: 'inventory-panel-window',
    close: 'inventory-panel-button-close',
    useButton: async (player: GamePlayer): Promise<void> => {
      await player.page.getByTestId('inventory-panel-button-close').click();
      await expect(player.page.locator('app-inventory')).toBeHidden();
    },
  },
  {
    name: 'settings',
    open: (player: GamePlayer): Promise<void> =>
      player.page.getByTestId('game-settings-button-toggle').click(),
    panel: 'game-settings-panel-window',
    close: 'game-settings-button-close',
    useButton: async (player: GamePlayer): Promise<void> => {
      await player.page.getByTestId('game-settings-button-inventory').click();
      await expect(player.page.locator('.kb-side-panel')).toBeVisible();
    },
  },
];

async function box(locator: Locator): Promise<Box> {
  const b: Box | null = await locator.boundingBox();
  expect(b, 'panel has a box').not.toBeNull();
  return b!;
}

/** Drags from the middle of the dialog's title (never a button) by (dx, dy). */
async function dragTitle(page: Page, panel: Locator, dx: number, dy: number): Promise<void> {
  const title: Box = await box(panel.locator('.px-drag-handle h2').first());
  const x: number = title.x + Math.min(title.width / 2, 40);
  const y: number = title.y + title.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test.describe('draggable dialogs', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
  });

  for (const c of CASES) {
    test(`${c.name}: drags by its header, buttons still work, reopens in its spot`, async (): Promise<void> => {
      const page: Page = player.page;
      const panel: Locator = page.getByTestId(c.panel);
      await c.open(player);
      await expect(panel).toBeVisible();
      await player.wait(250); // let the steps() open animation finish
      const start: Box = await box(panel);
      await expect(panel.locator('.px-drag-handle').first()).toHaveCSS('cursor', 'move');

      await dragTitle(page, panel, DRAG_X, DRAG_Y);
      await expect(panel, 'dragging the header does not close the dialog').toBeVisible();
      const moved: Box = await box(panel);
      expect(Math.abs(moved.x - start.x - DRAG_X), 'moved right with the pointer').toBeLessThan(3);
      expect(Math.abs(moved.y - start.y - DRAG_Y), 'moved down with the pointer').toBeLessThan(3);
      expect(moved.width, 'same size after the move').toBeCloseTo(start.width, 0);

      // A drag that starts on a header button does not move the dialog. It lets go over the
      // header, so the click lands on the header (not the button or the backdrop).
      const closeBox: Box = await box(page.getByTestId(c.close));
      const cx: number = closeBox.x + closeBox.width / 2;
      const cy: number = closeBox.y + closeBox.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 60, cy, { steps: 4 });
      await page.mouse.up();
      await expect(panel).toBeVisible();
      const still: Box = await box(panel);
      expect(Math.abs(still.x - moved.x), 'no drag from a button').toBeLessThan(1);
      expect(Math.abs(still.y - moved.y), 'no drag from a button').toBeLessThan(1);

      await c.useButton(player);

      // Reopened, it is back in its default spot.
      if (await panel.isVisible()) await page.getByTestId(c.close).click();
      await expect(panel).toBeHidden();
      await c.open(player);
      await expect(panel).toBeVisible();
      await player.wait(250);
      const reopened: Box = await box(panel);
      expect(Math.abs(reopened.x - start.x), 'reopens at its default x').toBeLessThan(3);
      expect(Math.abs(reopened.y - start.y), 'reopens at its default y').toBeLessThan(3);
    });
  }
});
