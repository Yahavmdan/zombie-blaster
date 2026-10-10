import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';

/**
 * Leaving and coming back: panel keys held down, quitting mid-game, a reload without a character,
 * and key bindings that survive a reload.
 */

async function openSettings(player: GamePlayer): Promise<void> {
  await player.page.getByTestId('game-settings-button-toggle').click();
  await expect(player.page.getByTestId('game-settings-button-close')).toBeVisible();
}

test.describe('session and settings', { tag: '@solo' }, (): void => {
  test('holding a panel key opens the panel once instead of flickering', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    const panel: Locator = player.page.locator('app-stat-allocation');
    await player.page.keyboard.down(KEYS.openStats);
    await expect(panel).toBeVisible();
    // The OS auto-repeats a held key (KeyboardEvent.repeat); Playwright never sends repeats.
    await player.page.evaluate((key: string): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true }));
    }, KEYS.openStats);
    await player.page.waitForTimeout(100);
    await player.page.keyboard.up(KEYS.openStats);
    await expect(panel, 'still open after the key repeated').toBeVisible();

    await player.press(KEYS.openStats);
    await expect(panel, 'a fresh press closes it').toBeHidden();
  });

  test('settings has a quit button that goes back to the menu', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('mage');
    await openSettings(player);
    const quit: Locator = player.page.getByTestId('game-settings-button-quit');
    await quit.click();
    await expect(player.page, 'one click only arms it').toHaveURL(/\/game/);
    await quit.click();
    await expect(player.page.getByTestId('menu-main-button-singleplayer')).toBeVisible();
  });

  test('a game page without a character sends the player to character select', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('ranger');
    await player.page.goto('/game?mode=multiplayer&roomId=gone');
    await player.page.getByTestId('game-nochar-button-select').click();
    await expect(player.page).toHaveURL(/\/character-select\?mode=multiplayer/);
  });

  test('key bindings survive a reload and a new game', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('assassin');
    await openSettings(player);
    await player.page
      .getByTestId('game-settings-action-jump')
      .dragTo(player.page.getByTestId('game-settings-key-y'));
    await expect(player.page.getByTestId('game-settings-key-y')).toContainText('Jump');

    await player.startSolo();
    await openSettings(player);
    await expect(player.page.getByTestId('game-settings-key-y'), 'Y is still jump').toContainText(
      'Jump',
    );
  });
});
