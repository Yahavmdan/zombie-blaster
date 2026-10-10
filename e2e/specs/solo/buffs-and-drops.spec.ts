import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot } from '../../support/probe';

/**
 * Buffs that change derived stats (Hyper Body, Claw Mastery) and the special-drop Y/N prompt.
 */

async function maxedPlayer(solo: SoloFactory, classId: GamePlayer['classId']): Promise<GamePlayer> {
  const player: GamePlayer = await solo(classId);
  await player.probe.maxOutPlayer();
  await player.probe.setGodMode(true);
  await player.probe.waitFor('player grounded', (s: E2eSnapshot): boolean => s.player!.isGrounded, {
    timeoutMs: 5_000,
  });
  return player;
}

async function castById(player: GamePlayer, skillId: string): Promise<void> {
  const skill: E2eSkillView | undefined = (await player.probe.state()).usableSkills.find(
    (k: E2eSkillView): boolean => k.id === skillId,
  );
  expect(skill, `${skillId} is usable`).toBeDefined();
  await player.castSkill(skill!.slot);
}

/** Drops a special right on the player; the magnet pulls it in and the Y/N prompt opens. */
async function openSpecialPrompt(player: GamePlayer, type: string): Promise<void> {
  const p: E2eSnapshot['player'] = (await player.probe.state()).player!;
  await player.probe.spawnDrop('special', p!.x, p!.y, type);
  await player.probe.waitFor(
    'special-drop prompt open',
    (s: E2eSnapshot): boolean => s.hasPendingSpecialDrop,
    {
      timeoutMs: 3_000,
    },
  );
}

test.describe('buffs and special drops', { tag: '@solo' }, (): void => {
  test('Hyper Body raises max HP and MP while it lasts', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await maxedPlayer(solo, 'warrior');
    const before: E2eSnapshot = await player.probe.state();
    await castById(player, 'warrior-hyper-body');
    await player.probe.waitFor(
      'max HP and MP raised by the buff',
      (s: E2eSnapshot): boolean =>
        s.player!.maxHp > before.player!.maxHp && s.player!.maxMp > before.player!.maxMp,
      { timeoutMs: 3_000 },
    );
  });

  test('Claw Mastery raises the crit rate while it lasts', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    // Not maxed out: a maxed assassin's luck already sits at the crit cap.
    const player: GamePlayer = await solo('assassin');
    await player.probe.setGodMode(true);
    await player.probe.levelUp(5);
    await player.probe.maxAllSkills();
    await player.probe.waitFor(
      'player grounded',
      (s: E2eSnapshot): boolean => s.player!.isGrounded,
      {
        timeoutMs: 5_000,
      },
    );
    const before: number = (await player.probe.state()).player!.critRate;
    await castById(player, 'assassin-claw-mastery');
    await player.probe.waitFor(
      'crit rate raised by the buff',
      (s: E2eSnapshot): boolean => s.player!.critRate > before,
      { timeoutMs: 3_000 },
    );
  });

  test('the special-drop prompt answers Y while the shop is open', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await maxedPlayer(solo, 'warrior');
    await openSpecialPrompt(player, 'low-gravity');
    await player.press(KEYS.openShop);
    await expect(player.page.getByTestId('shop-panel-button-close')).toBeVisible();
    await player.press('y');
    await player.probe.waitFor(
      'Y with the shop open activates the drop',
      (s: E2eSnapshot): boolean =>
        s.activeSpecialEffects.includes('low-gravity') && !s.hasPendingSpecialDrop,
      { timeoutMs: 2_000 },
    );
  });

  test('a key the player bound to an action keeps its action while the prompt is open', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await maxedPlayer(solo, 'warrior');
    await player.page.getByTestId('game-settings-button-toggle').click();
    await player.page
      .getByTestId('game-settings-action-jump')
      .dragTo(player.page.getByTestId('game-settings-key-y'));
    await player.page.getByTestId('game-settings-button-close').click();
    await expect(player.page.getByTestId('game-settings-button-close')).toBeHidden();

    await openSpecialPrompt(player, 'low-gravity');
    await player.press('y', 120);
    await player.probe.waitFor(
      'Y jumps (the player bound it to jump)',
      (s: E2eSnapshot): boolean => !s.player!.isGrounded,
      {
        timeoutMs: 2_000,
      },
    );
    const s: E2eSnapshot = await player.probe.state();
    expect(s.hasPendingSpecialDrop, 'the prompt did not eat the jump key').toBe(true);
    expect(s.activeSpecialEffects).toEqual([]);
  });
});
