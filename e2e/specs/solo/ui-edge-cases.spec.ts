import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot, E2eZombieView } from '../../support/probe';

/**
 * UI corners the main UI specs don't reach: toggling and stacking dialogs, rebinding a key that is
 * already in use, what survives "Try again" and input behind the game-over screen.
 */

const PANELS: string[] = ['app-stat-allocation', 'app-skill-tree', 'app-shop', 'app-inventory'];
const MP_POTION: string = 'mp-potion-1';

async function visiblePanels(player: GamePlayer): Promise<string[]> {
  const open: string[] = [];
  for (const selector of [...PANELS, 'app-settings .kb-footer']) {
    if (await player.page.locator(selector).isVisible()) open.push(selector);
  }
  return open;
}

/** Stands in the zombies on a late floor (full damage) until the game-over screen shows. */
async function dieQuickly(player: GamePlayer): Promise<void> {
  await player.probe.setGodMode(false);
  await player.probe.setFloor(8);
  const deadline: number = Date.now() + 120_000;
  while (Date.now() < deadline && !(await player.probe.isGameOver())) {
    const s: E2eSnapshot = await player.probe.state();
    const target: E2eZombieView | undefined = s.zombies.find(
      (z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0,
    );
    if (target) await player.probe.teleport(target.x, target.y + target.height - 48);
    await player.wait(500);
  }
  expect(await player.probe.isGameOver(), 'player died').toBe(true);
  await expect(player.page.getByTestId('game-gameover-button-retry')).toBeVisible();
}

async function rebindQuickSlot(player: GamePlayer, slot: string, key: string): Promise<void> {
  await player.page.getByTestId('game-settings-button-toggle').click();
  await player.page.getByTestId(`game-settings-button-rebind-${slot}`).click();
  await player.page.keyboard.press(key);
  await expect(player.page.getByTestId(`game-settings-quickslot-key-${slot}`)).toHaveText(
    key.toUpperCase(),
  );
  await player.page.getByTestId('game-settings-button-close').click();
  await expect(player.page.getByTestId('game-settings-button-close')).toBeHidden();
}

test.describe('in-game UI edge cases', { tag: '@solo' }, (): void => {
  test('pressing a dialog key again closes it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('ranger');
    await player.probe.setGodMode(true);
    const stats: Locator = player.page.locator('app-stat-allocation');
    await player.press(KEYS.openStats);
    await expect(stats).toBeVisible();
    await player.press(KEYS.openStats);
    await expect(stats).toBeHidden({ timeout: 2_000 });

    // Another dialog key switches straight to that dialog.
    await player.press(KEYS.openStats);
    await expect(stats).toBeVisible();
    await player.press(KEYS.openSkills);
    await expect(player.page.locator('app-skill-tree')).toBeVisible();
    await expect(stats).toBeHidden();
  });

  test('opening settings over an open dialog never shows two panels at once', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('ranger');
    await player.probe.setGodMode(true);
    await player.press(KEYS.openStats);
    await expect(player.page.locator('app-stat-allocation')).toBeVisible();
    await player.page
      .getByTestId('game-settings-button-toggle')
      .click({ timeout: 2_000 })
      .catch((): void => undefined);
    await player.wait(300);
    const open: string[] = await visiblePanels(player);
    expect(open.length, `open panels: ${open.join(', ')}`).toBeLessThanOrEqual(1);
  });

  test('a quick slot rebound to a key already in use fires on that key', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    // No god mode: it makes skills free, and this test needs MP spent.
    await player.probe.maxAllSkills();
    // quickSlot6 holds the MP potion by default; move it onto J, the attack key.
    await rebindQuickSlot(player, 'quickSlot6', KEYS.attack);

    const strike: E2eSkillView | undefined = (await player.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.id === 'warrior-power-strike',
    );
    await player.castSkill(strike!.slot);
    const spent: E2eSnapshot = await player.probe.waitFor(
      'MP spent',
      (s: E2eSnapshot): boolean => s.player!.mp < s.player!.maxMp,
    );
    const potions: number = spent.player!.potions[MP_POTION] ?? 0;
    await player.wait(700);
    await player.press(KEYS.attack, 120);
    await player.probe.waitFor(
      'J (now the MP potion slot) drinks an MP potion',
      (s: E2eSnapshot): boolean => (s.player!.potions[MP_POTION] ?? 0) === potions - 1,
      { timeoutMs: 2_000 },
    );
  });

  test('dialog keys do nothing behind the game-over screen', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(180_000);
    const player: GamePlayer = await solo('mage');
    await dieQuickly(player);
    await player.press(KEYS.openStats);
    await player.press(KEYS.openShop);
    await player.wait(300);
    expect(await visiblePanels(player)).toEqual([]);
  });

  test('"Try again" keeps the player\'s key bindings', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(180_000);
    const player: GamePlayer = await solo('mage');
    await player.probe.setGodMode(true);
    await rebindQuickSlot(player, 'quickSlot6', 'k');
    await dieQuickly(player);
    await player.page.getByTestId('game-gameover-button-retry').click();
    await player.probe.waitFor(
      'respawned',
      (s: E2eSnapshot): boolean => s.player !== null && !s.player.isDead,
    );
    await player.page.getByTestId('game-settings-button-toggle').click();
    await expect(player.page.getByTestId('game-settings-quickslot-key-quickSlot6')).toHaveText(
      'K',
      { timeout: 2_000 },
    );
  });
});
