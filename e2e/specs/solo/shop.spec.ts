import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

/** Mirrors SHOP_HP_POTION_PRICE / SHOP_MP_POTION_PRICE in shared/game-constants.ts. */
const HP_PRICE: number = 30;
const MP_PRICE: number = 20;
const HP_ITEM: string = 'shop-hp-potion-1';
const MP_ITEM: string = 'shop-mp-potion-1';

/** Dev builds start every character with this much gold (game-state.service.ts). */
const DEV_START_GOLD: number = 1_000_000;

async function openShop(player: GamePlayer): Promise<Locator> {
  await player.press(KEYS.openShop);
  const shop: Locator = player.page.locator('app-shop');
  await expect(shop).toBeVisible();
  return shop;
}

function potions(s: E2eSnapshot, id: string): number {
  return s.player!.potions[id] ?? 0;
}

test.describe('shop', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
  });

  test('buying potions takes price x quantity in gold and adds the potions', async (): Promise<void> => {
    const before: E2eSnapshot = await player.probe.state();
    expect(before.player!.gold, 'dev builds start rich').toBe(DEV_START_GOLD);
    const hpBefore: number = potions(before, 'hp-potion-1');
    const mpBefore: number = potions(before, 'mp-potion-1');
    const shop: Locator = await openShop(player);

    // HP potions: + twice = 3, the row's price follows the quantity.
    await player.page.getByTestId(`shop-item-button-qty-plus-${HP_ITEM}`).click();
    await player.page.getByTestId(`shop-item-button-qty-plus-${HP_ITEM}`).click();
    await expect(player.page.getByTestId(`shop-item-input-qty-${HP_ITEM}`)).toHaveValue('3');
    await player.page.getByTestId(`shop-item-button-buy-${HP_ITEM}`).click();
    const afterHp: E2eSnapshot = await player.probe.waitFor(
      '3 HP potions bought',
      (s: E2eSnapshot): boolean => potions(s, 'hp-potion-1') === hpBefore + 3,
    );
    expect(afterHp.player!.gold).toBe(DEV_START_GOLD - 3 * HP_PRICE);
    expect(potions(afterHp, 'mp-potion-1'), 'MP potions untouched').toBe(mpBefore);

    // MP potions: type the quantity, then minus once = 4.
    await player.page.getByTestId(`shop-item-input-qty-${MP_ITEM}`).fill('5');
    await player.page.getByTestId(`shop-item-button-qty-minus-${MP_ITEM}`).click();
    await expect(player.page.getByTestId(`shop-item-input-qty-${MP_ITEM}`)).toHaveValue('4');
    await player.page.getByTestId(`shop-item-button-buy-${MP_ITEM}`).click();
    const afterMp: E2eSnapshot = await player.probe.waitFor(
      '4 MP potions bought',
      (s: E2eSnapshot): boolean => potions(s, 'mp-potion-1') === mpBefore + 4,
    );
    const goldLeft: number = DEV_START_GOLD - 3 * HP_PRICE - 4 * MP_PRICE;
    expect(afterMp.player!.gold).toBe(goldLeft);
    expect(potions(afterMp, 'hp-potion-1')).toBe(hpBefore + 3);
    await expect(shop.locator('.shop-gold'), 'the shop shows the gold left').toContainText(
      String(goldLeft),
    );
    await expect(shop.locator('.shop-item').first()).toContainText(`Owned: ${hpBefore + 3}`);

    // The HUD potion key works with the bought stock: drink one after getting hurt.
    await player.press(KEYS.openShop);
    await expect(shop).toBeHidden();
    await player.probe.setVitals(1, afterMp.player!.maxMp);
    await player.press(KEYS.hpPotion, 70);
    await player.probe.waitFor(
      'drank a bought HP potion',
      (s: E2eSnapshot): boolean => potions(s, 'hp-potion-1') === hpBefore + 2 && s.player!.hp > 1,
    );
  });

  test('without enough gold nothing can be bought', async (): Promise<void> => {
    await player.probe.setGold(0);
    await player.probe.waitFor('gold is 0', (s: E2eSnapshot): boolean => s.player!.gold === 0);
    const before: E2eSnapshot = await player.probe.state();
    const shop: Locator = await openShop(player);
    await expect(shop.locator('.shop-gold')).toContainText('0');

    for (const item of [HP_ITEM, MP_ITEM]) {
      const buy: Locator = player.page.getByTestId(`shop-item-button-buy-${item}`);
      await expect(buy, `${item}: buy is disabled at 0 gold`).toBeDisabled();
      await buy.click({ force: true });
    }
    await player.wait(400);
    const after: E2eSnapshot = await player.probe.state();
    expect(after.player!.gold, 'no gold went anywhere').toBe(0);
    expect(after.player!.potions, 'no potion appeared').toEqual(before.player!.potions);
  });

  test('a quantity over budget buys only what the gold covers, then runs dry', async (): Promise<void> => {
    // 50 gold: one HP potion (30), then one MP potion (20), then nothing.
    await player.probe.setGold(50);
    await player.probe.waitFor('gold is 50', (s: E2eSnapshot): boolean => s.player!.gold === 50);
    const before: E2eSnapshot = await player.probe.state();
    const hpBefore: number = potions(before, 'hp-potion-1');
    const mpBefore: number = potions(before, 'mp-potion-1');
    await openShop(player);

    const hpPlus: Locator = player.page.getByTestId(`shop-item-button-qty-plus-${HP_ITEM}`);
    await expect(hpPlus, 'one HP potion is all 50 gold covers').toBeDisabled();
    await player.page.getByTestId(`shop-item-input-qty-${HP_ITEM}`).fill('5');
    await player.page.getByTestId(`shop-item-button-buy-${HP_ITEM}`).click();
    const afterHp: E2eSnapshot = await player.probe.waitFor(
      'bought one HP potion',
      (s: E2eSnapshot): boolean => potions(s, 'hp-potion-1') === hpBefore + 1,
    );
    expect(afterHp.player!.gold).toBe(50 - HP_PRICE);

    await expect(
      player.page.getByTestId(`shop-item-button-buy-${HP_ITEM}`),
      '20 gold no longer covers an HP potion',
    ).toBeDisabled();
    await player.page.getByTestId(`shop-item-button-buy-${MP_ITEM}`).click();
    const afterMp: E2eSnapshot = await player.probe.waitFor(
      'bought one MP potion',
      (s: E2eSnapshot): boolean => potions(s, 'mp-potion-1') === mpBefore + 1,
    );
    expect(afterMp.player!.gold).toBe(0);
    await expect(player.page.getByTestId(`shop-item-button-buy-${MP_ITEM}`)).toBeDisabled();
    expect(potions(afterMp, 'hp-potion-1'), 'still exactly one HP potion more').toBe(hpBefore + 1);
  });
});
