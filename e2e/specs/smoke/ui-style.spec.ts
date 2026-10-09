import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';

const PIXEL_FONT: string = 'Pixelify Sans';

interface PanelCase {
  name: string;
  open: (page: Page) => Promise<void>;
  selector: string;
}

const PANELS: PanelCase[] = [
  {
    name: 'stats',
    open: (p: Page): Promise<void> => p.keyboard.press(KEYS.openStats),
    selector: 'app-stat-allocation',
  },
  {
    name: 'skill tree',
    open: (p: Page): Promise<void> => p.keyboard.press(KEYS.openSkills),
    selector: 'app-skill-tree',
  },
  {
    name: 'shop',
    open: (p: Page): Promise<void> => p.keyboard.press(KEYS.openShop),
    selector: 'app-shop',
  },
  {
    name: 'inventory',
    open: (p: Page): Promise<void> => p.keyboard.press(KEYS.openInventory),
    selector: 'app-inventory',
  },
  {
    name: 'settings',
    open: (p: Page): Promise<void> => p.getByTestId('game-settings-button-toggle').click(),
    selector: '.settings-overlay',
  },
];

/** Visible text that is an emoji / pictograph (key-cap arrows are allowed). */
async function pictographs(page: Page): Promise<string[]> {
  return page.evaluate(
    (): string[] => document.body.innerText.match(/\p{Extended_Pictographic}/gu) ?? [],
  );
}

async function expectPixelFont(page: Page): Promise<void> {
  const family: string = await page.evaluate(
    (): string => getComputedStyle(document.body).fontFamily,
  );
  expect(family).toContain(PIXEL_FONT);
  await expect
    .poll(
      (): Promise<boolean> =>
        page.evaluate((f: string): boolean => document.fonts.check(`16px "${f}"`), PIXEL_FONT),
    )
    .toBe(true);
}

test.describe('pixel UI style', { tag: '@smoke' }, (): void => {
  test(
    'menus use the pixel font and no emoji',
    { tag: '@external-safe' },
    async ({ page }: { page: Page }): Promise<void> => {
      await page.goto('/');
      await expectPixelFont(page);
      expect(await pictographs(page)).toEqual([]);

      await page.getByTestId('menu-main-button-singleplayer').click();
      await expect(page.getByTestId('charselect-class-button-warrior')).toBeVisible();
      expect(await pictographs(page)).toEqual([]);
      await expect(page.locator('img.pixel-icon').first()).toBeVisible();
    },
  );

  test('in-game HUD and every panel draw pixel icons, not emoji', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    const page: Page = player.page;

    await expectPixelFont(page);
    await expect(page.locator('app-hud img.pixel-icon').first()).toBeVisible();
    expect(await pictographs(page)).toEqual([]);

    for (const panel of PANELS) {
      await panel.open(page);
      const root: Locator = page.locator(panel.selector);
      await expect(root, `${panel.name} opens`).toBeVisible();
      await expect(
        root.locator('img.pixel-icon').first(),
        `${panel.name} shows pixel icons`,
      ).toBeVisible();
      expect(await pictographs(page), `${panel.name} has no emoji`).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(root, `${panel.name} closes`).toBeHidden();
    }
  });
});
