import { Page } from '@playwright/test';
import { test, expect } from '../../support/fixtures';
import { ALL_CLASSES, ClassId, GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

test.describe('menus and navigation', { tag: '@smoke' }, (): void => {
  test(
    'main menu offers exactly the supported modes',
    { tag: '@external-safe' },
    async ({ page }: { page: Page }): Promise<void> => {
      await page.goto('/');
      const labels: string[] = (await page.locator('.menu-buttons button').allInnerTexts()).map(
        (t: string): string => t.trim(),
      );
      expect(labels).toEqual(['NEW GAME', 'MULTIPLAYER', 'HOW TO PLAY']);

      await page.getByTestId('menu-main-button-howtoplay').click();
      await expect(page.locator('.help-panel')).toBeVisible();
      await page.getByTestId('menu-main-button-howtoplay').click();
      await expect(page.locator('.help-panel')).toBeHidden();
    },
  );

  test(
    'character select needs a name and a class',
    { tag: '@external-safe' },
    async ({ page }: { page: Page }): Promise<void> => {
      await page.goto('/');
      await page.getByTestId('menu-main-button-singleplayer').click();
      await page.getByTestId('charselect-name-input-name').fill('');
      await page.getByTestId('charselect-class-button-warrior').click();
      await expect(page.getByTestId('charselect-nav-button-start')).toBeDisabled();
      await page.getByTestId('charselect-name-input-name').fill('Hero');
      await expect(page.getByTestId('charselect-nav-button-start')).toBeEnabled();

      await page.getByTestId('charselect-nav-button-back').click();
      await expect(page.getByTestId('menu-main-button-singleplayer')).toBeVisible();
    },
  );

  test(
    'game page without a character shows the select-character screen',
    { tag: '@external-safe' },
    async ({ page }: { page: Page }): Promise<void> => {
      await page.goto('/game');
      await expect(page.getByTestId('game-nochar-button-select')).toBeVisible();
    },
  );

  for (const classId of ALL_CLASSES) {
    test(`solo game boots for ${classId}`, async ({
      solo,
    }: {
      solo: (c?: ClassId) => Promise<GamePlayer>;
    }): Promise<void> => {
      const player: GamePlayer = await solo(classId);
      const s: E2eSnapshot = await player.probe.state();
      expect(s.role).toBe('solo');
      expect(s.floor).toBe(1);
      expect(s.player?.classId).toBe(classId);
      expect(s.player?.hp).toBe(s.player?.maxHp);
      await player.probe.waitFor(
        'zombies spawn',
        (st: E2eSnapshot): boolean => st.zombies.length > 0,
        { timeoutMs: 20_000 },
      );
    });
  }
});
