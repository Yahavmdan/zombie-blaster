import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';

/**
 * Keyboard settings: a key moved onto another action leaves its old one (one key never does two
 * things), Clear and right-click unbind a key, and Reset defaults brings every default back, saved.
 */

type SavedBindings = Record<string, string[]>;

async function openSettings(player: GamePlayer): Promise<void> {
  await player.page.getByTestId('game-settings-button-toggle').click();
  await expect(player.page.getByTestId('game-settings-button-close')).toBeVisible();
}

async function closeSettings(player: GamePlayer): Promise<void> {
  await player.page.getByTestId('game-settings-button-close').click();
  await expect(player.page.getByTestId('game-settings-button-close')).toBeHidden();
}

function keyButton(player: GamePlayer, key: string): Locator {
  return player.page.getByTestId(`game-settings-key-${key}`);
}

/** Selects a key on the settings keyboard, then picks the action chip for it. */
async function bindKey(player: GamePlayer, key: string, action: string): Promise<void> {
  await keyButton(player, key).click();
  await player.page.getByTestId(`game-settings-action-${action}`).click();
}

async function savedBindings(player: GamePlayer): Promise<SavedBindings> {
  return player.page.evaluate(
    (): SavedBindings =>
      JSON.parse(localStorage.getItem('zb.keyBindings') ?? '{}') as SavedBindings,
  );
}

async function grounded(player: GamePlayer): Promise<E2eSnapshot> {
  return player.probe.waitFor(
    'standing on the ground',
    (s: E2eSnapshot): boolean => s.player!.isGrounded && Math.abs(s.player!.velocityY) < 0.01,
  );
}

/** Presses `key` once and reports whether the player jumped and/or attacked during the next ~0.7 s. */
async function pressAndWatch(
  player: GamePlayer,
  key: string,
): Promise<{ jumped: boolean; attacked: boolean }> {
  const startY: number = (await grounded(player)).player!.y;
  await player.hold(key);
  let jumped: boolean = false;
  let attacked: boolean = false;
  const end: number = Date.now() + 700;
  while (Date.now() < end) {
    const s: E2eSnapshot = await player.probe.state();
    if (s.player!.y < startY - 10) jumped = true;
    if (s.player!.isAttacking) attacked = true;
    if (Date.now() > end - 550) await player.release(key);
    await player.wait(40);
  }
  await player.release(key);
  return { jumped, attacked };
}

test.describe('keyboard settings', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
  });

  test('binding a key another action uses moves it: one key never does two things', async (): Promise<void> => {
    expect(await pressAndWatch(player, KEYS.attack), 'J attacks by default').toEqual({
      jumped: false,
      attacked: true,
    });

    await openSettings(player);
    await expect(keyButton(player, 'j')).toContainText('Attack');
    await bindKey(player, 'j', 'jump');
    await expect(keyButton(player, 'j')).toContainText('Jump');
    await expect(keyButton(player, 'j'), 'attack lost J').not.toContainText('Attack');
    await expect(keyButton(player, 'mouseleft'), 'attack keeps its other button').toContainText(
      'Attack',
    );
    const saved: SavedBindings = await savedBindings(player);
    expect(saved['jump'], 'saved: J jumps (Space too)').toEqual([' ', 'j']);
    expect(saved['attack'], 'saved: J no longer attacks').toEqual(['mouseleft']);
    await closeSettings(player);

    expect(await pressAndWatch(player, 'j'), 'J now only jumps').toEqual({
      jumped: true,
      attacked: false,
    });
  });

  test('Clear and right-click unbind a key', async (): Promise<void> => {
    await openSettings(player);
    await expect(keyButton(player, 'b')).toContainText('Shop');
    await keyButton(player, 'b').click();
    await player.page.getByTestId('game-settings-action-clear').click();
    await expect(keyButton(player, 'b'), 'B cleared').not.toContainText('Shop');

    await expect(keyButton(player, 'p')).toContainText('Stats');
    await keyButton(player, 'p').click({ button: 'right' });
    await expect(keyButton(player, 'p'), 'P cleared by right-click').not.toContainText('Stats');

    const saved: SavedBindings = await savedBindings(player);
    expect(saved['openShop']).toEqual([]);
    expect(saved['openStats']).toEqual([]);
    await closeSettings(player);

    await player.press(KEYS.openShop, 100);
    await player.press(KEYS.openStats, 100);
    await player.wait(500);
    await expect(player.page.locator('app-shop'), 'B opens nothing').toBeHidden();
    await expect(player.page.locator('app-stat-allocation'), 'P opens nothing').toBeHidden();
  });

  test('Reset defaults restores every binding and saves it', async (): Promise<void> => {
    await openSettings(player);
    await bindKey(player, 'j', 'jump');
    await keyButton(player, 'b').click();
    await player.page.getByTestId('game-settings-action-clear').click();
    await expect(keyButton(player, 'j')).toContainText('Jump');
    await expect(keyButton(player, 'b')).not.toContainText('Shop');

    await player.page.getByTestId('game-settings-button-reset').click();
    await expect(keyButton(player, 'j')).toContainText('Attack');
    await expect(keyButton(player, 'b')).toContainText('Shop');
    const saved: SavedBindings = await savedBindings(player);
    expect(saved['attack']).toEqual(['j', 'mouseleft']);
    expect(saved['jump']).toEqual([' ']);
    expect(saved['openShop']).toEqual(['b']);

    // A new game loads the saved bindings: the defaults, not the edits.
    await player.startSolo();
    await player.probe.setGodMode(true);
    await openSettings(player);
    await expect(keyButton(player, 'j')).toContainText('Attack');
    await expect(keyButton(player, 'b')).toContainText('Shop');
    await closeSettings(player);

    expect(await pressAndWatch(player, KEYS.attack), 'J attacks again').toEqual({
      jumped: false,
      attacked: true,
    });
    await player.press(KEYS.openShop, 100);
    await expect(player.page.locator('app-shop'), 'B opens the shop again').toBeVisible();
  });
});
