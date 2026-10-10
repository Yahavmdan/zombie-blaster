import { Locator, Page } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

/**
 * UI corners found in the 2026-10-10 edge-case sweep: the stat preview, modifier keys used as
 * game keys (Shift attacks, Alt drinks), dropping a skill on a plain keyboard key, the shop's
 * quantity field and a blank character name. The first five were bugs, fixed the same day.
 */

const HP_POTION: string = 'hp-potion-1';
const POTION_SHOP_ID: string = `shop-${HP_POTION}`;
const HP_POTION_PRICE: number = 30;

type SavedBindings = Record<string, string[]>;

async function savedBindings(page: Page): Promise<SavedBindings> {
  return page.evaluate(
    (): SavedBindings =>
      JSON.parse(localStorage.getItem('zb.keyBindings') ?? '{}') as SavedBindings,
  );
}

/** Rests on the safe spot so menus and waiting are not interrupted by zombies. */
async function restOnSafeSpot(player: GamePlayer): Promise<void> {
  const s: E2eSnapshot = await player.probe.state();
  const safe: { x: number; y: number; width: number } = s.level.safeSpot!;
  await player.probe.teleport(
    safe.x + safe.width / 2 - WORLD.playerWidth / 2,
    safe.y - WORLD.playerHeight,
  );
  await player.probe.waitFor(
    'resting on the safe spot',
    (st: E2eSnapshot): boolean =>
      st.player!.isGrounded && st.player!.y + WORLD.playerHeight === safe.y,
  );
}

test.describe('UI edge sweep', { tag: '@solo' }, (): void => {
  test('after a level-up the stat preview shows no negative "+-" HP/MP deltas', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await player.probe.levelUp(3);
    await player.press(KEYS.openStats);
    const panel: Locator = player.page.locator('app-stat-allocation');
    await expect(panel).toBeVisible();
    const deltas: string[] = await panel.locator('.preview-delta').allInnerTexts();
    expect(
      deltas.filter((d: string): boolean => d.includes('+-')),
      deltas.join(' | '),
    ).toEqual([]);
  });

  test('a skill key released while Shift (attack) is held does not keep casting', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxAllSkills();
    await player.probe.setGodMode(true);
    const skill: E2eSkillView = (await player.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.slot === 1,
    )!;

    await player.page.keyboard.down('Digit1');
    await player.probe.waitFor('skill 1 cast', (s: E2eSnapshot): boolean =>
      s.usableSkills.some((k: E2eSkillView): boolean => k.id === skill.id && k.cooldownTicks > 0),
    );
    await player.page.keyboard.down('Shift');
    await player.page.keyboard.up('Digit1');
    await player.page.keyboard.up('Shift');

    // Wait for the cooldown to end, then watch: nothing is held, so it must stay off cooldown.
    await player.probe.waitFor(
      'cooldown over',
      (s: E2eSnapshot): boolean =>
        s.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)!.cooldownTicks === 0,
      { timeoutMs: 20_000 },
    );
    let recast: boolean = false;
    const end: number = Date.now() + 1_500;
    while (Date.now() < end && !recast) {
      const s: E2eSnapshot = await player.probe.state();
      recast =
        s.usableSkills.find((k: E2eSkillView): boolean => k.id === skill.id)!.cooldownTicks > 0;
      await player.wait(50);
    }
    expect(recast, `${skill.id} cast again with no key held`).toBe(false);
  });

  test('Alt+Tab away from the game does not drink an HP potion', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await restOnSafeSpot(player);
    const s0: E2eSnapshot = await player.probe.state();
    await player.probe.setVitals(Math.ceil(s0.player!.maxHp / 3), s0.player!.maxMp);
    await player.wait(700);
    const before: number = (await player.probe.state()).player!.potions[HP_POTION] ?? 0;

    await player.page.keyboard.down('Alt');
    await player.wait(30);
    await player.page.evaluate((): void => {
      window.dispatchEvent(new Event('blur'));
    });
    await player.page.keyboard.up('Alt');
    await player.wait(400);
    const after: number = (await player.probe.state()).player!.potions[HP_POTION] ?? 0;
    expect(after, 'no potion drunk by switching windows').toBe(before);

    // A clean Alt tap (nothing else pressed, window kept) still drinks, on release.
    await player.press('Alt', 80);
    await player.probe.waitFor(
      'a clean Alt tap drinks an HP potion',
      (s: E2eSnapshot): boolean => (s.player!.potions[HP_POTION] ?? 0) === before - 1,
      { timeoutMs: 2_000 },
    );
  });

  test('Shift (attack) + 1 still casts skill 1', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxAllSkills();
    await player.probe.setGodMode(true);
    const skill: E2eSkillView = (await player.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.slot === 1,
    )!;
    await player.page.keyboard.down('Shift');
    await player.page.keyboard.press('Digit1', { delay: 80 });
    await player.page.keyboard.up('Shift');
    await player.probe.waitFor(`${skill.id} cast with Shift held`, (s: E2eSnapshot): boolean =>
      s.usableSkills.some((k: E2eSkillView): boolean => k.id === skill.id && k.cooldownTicks > 0),
    );
  });

  test('a skill dropped on a plain keyboard key binds that key only', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxAllSkills();
    await player.probe.setGodMode(true);
    await player.page.getByTestId('game-settings-button-toggle').click();
    await player.page.getByTestId('game-settings-button-skills').click();
    await player.page
      .getByTestId('game-settings-item-warrior-power-strike')
      .dragTo(player.page.getByTestId('game-settings-key-g'));
    await expect(player.page.getByTestId('game-settings-key-g')).toContainText(/power/i);
    await player.page.getByTestId('game-settings-button-close').click();

    const saved: SavedBindings = await savedBindings(player.page);
    const action: string | undefined = Object.keys(saved).find((a: string): boolean =>
      saved[a].includes('g'),
    );
    expect(action, 'G is bound to a quick slot').toBeDefined();
    expect(saved[action!], `${action} bindings`).toEqual(['g']);
  });

  test('the shop quantity field shows what Buy will buy', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await player.probe.setGodMode(true);
    await restOnSafeSpot(player);
    await player.probe.setGold(HP_POTION_PRICE);
    await player.press(KEYS.openShop);
    const qty: Locator = player.page.getByTestId(`shop-item-input-qty-${POTION_SHOP_ID}`);
    await expect(qty).toBeVisible();
    await qty.fill('5');
    await qty.blur();
    await expect(qty, 'gold for one potion: the field says 1').toHaveValue('1');
  });

  test(
    'a name of only spaces cannot start a game',
    { tag: '@external-safe' },
    async ({ page }: { page: Page }): Promise<void> => {
      await page.goto('/');
      await page.getByTestId('menu-main-button-singleplayer').click();
      await page.getByTestId('charselect-name-input-name').fill('   ');
      await page.getByTestId('charselect-class-button-warrior').click();
      await expect(page.getByTestId('charselect-nav-button-start')).toBeDisabled();
    },
  );
});
