import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

/** Mirrors HUD_POTION_LOW_COUNT in shared/game-constants.ts. */
const LOW_COUNT: number = 10;
const HP_ITEM: string = 'shop-hp-potion-1';

function potions(s: E2eSnapshot, id: string): number {
  return s.player!.potions[id] ?? 0;
}

test.describe('potion counters in the tray', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
  });

  test('the tray always shows how many potions are held and warns below 10', async (): Promise<void> => {
    const before: E2eSnapshot = await player.probe.state();
    const hp: number = potions(before, 'hp-potion-1');
    const mp: number = potions(before, 'mp-potion-1');
    expect(hp, 'a new character starts with few potions').toBeLessThan(LOW_COUNT);
    const hpCell: Locator = player.page.getByTestId('quickslot-stock-hp');
    const mpCell: Locator = player.page.getByTestId('quickslot-stock-mp');
    await expect(player.page.getByTestId('quickslot-stock-count-hp')).toHaveText(String(hp));
    await expect(player.page.getByTestId('quickslot-stock-count-mp')).toHaveText(String(mp));
    await expect(hpCell).toHaveClass(/qs-stock-cell--low/);
    await expect(player.page.getByTestId('quickslot-stock-low-hp')).toHaveText('Low');
    await expect(player.page.getByTestId('quickslot-stock-low-mp')).toBeVisible();

    // Buy enough HP potions to reach 10: the HP warning goes, the MP one stays.
    await player.press(KEYS.openShop);
    await expect(player.page.locator('app-shop')).toBeVisible();
    await player.page.getByTestId(`shop-item-input-qty-${HP_ITEM}`).fill(String(LOW_COUNT - hp));
    await player.page.getByTestId(`shop-item-button-buy-${HP_ITEM}`).click();
    await player.press(KEYS.openShop);
    await expect(player.page.getByTestId('quickslot-stock-count-hp')).toHaveText(String(LOW_COUNT));
    await expect(hpCell).not.toHaveClass(/qs-stock-cell--low/);
    await expect(player.page.getByTestId('quickslot-stock-low-hp')).toHaveCount(0);
    await expect(mpCell).toHaveClass(/qs-stock-cell--low/);

    // Drinking one drops it back under 10: the warning returns.
    await player.probe.setVitals(1, before.player!.maxMp);
    await player.press(KEYS.hpPotion, 70);
    await player.probe.waitFor(
      'drank an HP potion',
      (s: E2eSnapshot): boolean => potions(s, 'hp-potion-1') < LOW_COUNT,
    );
    // Auto-potion may drink more meanwhile: any single digit is under 10.
    await expect(player.page.getByTestId('quickslot-stock-count-hp')).toHaveText(/^\d$/);
    await expect(hpCell).toHaveClass(/qs-stock-cell--low/);
  });
});
