import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { layoutWhere } from '../../support/navigation';
import { findProp, LevelProp, pickableOnGround } from '../../support/props';

/**
 * Solo corners found in the 2026-10-10 edge-case sweep: the skill bar cap, what "Try again"
 * carries over, low gravity against the exit rule, down+jump on a prop and the shop's auto-potion
 * choice. Known bugs are pinned with `test.fail` and tagged `@bug`; delete both once fixed.
 */

const WARRIOR_ACTIVE_SKILLS: number = 7;
const HP_POTION_2: string = 'hp-potion-2';

/** Feet y of the player in a snapshot. */
function feetY(s: E2eSnapshot): number {
  return s.player!.y + WORLD.playerHeight;
}

test.describe('solo edge sweep', { tag: '@solo' }, (): void => {
  test(
    'a maxed warrior can use every one of its active skills (Dragon Roar is the 7th)',
    { tag: '@bug' },
    async ({ solo }: { solo: SoloFactory }): Promise<void> => {
      test.fail(
        true,
        'KNOWN BUG: usable skills are sorted by level and cut to 6 (game-engine.ts slice(0, 6)); the warrior has 7',
      );
      const player: GamePlayer = await solo('warrior');
      await player.probe.maxOutPlayer();
      const s: E2eSnapshot = await player.probe.waitFor(
        'skills learned',
        (st: E2eSnapshot): boolean => st.usableSkills.length > 0,
      );
      const ids: string[] = s.usableSkills.map((k: E2eSkillView): string => k.id);
      expect(ids, `usable: ${ids.join(', ')}`).toContain('warrior-dragon-roar');
      expect(ids).toHaveLength(WARRIOR_ACTIVE_SKILLS);
    },
  );

  test(
    '"Try again" does not bring back the special-drop prompt of the run that ended',
    { tag: '@bug' },
    async ({ solo }: { solo: SoloFactory }): Promise<void> => {
      test.fail(
        true,
        'KNOWN BUG: GameEngine.start() never resets pendingSpecialDropConfirm; solo death stops update() before the prompt times out',
      );
      const player: GamePlayer = await solo('warrior');
      const p: E2eSnapshot = await player.probe.state();
      await player.probe.spawnDrop('special', p.player!.x, p.player!.y, 'low-gravity');
      await player.probe.waitFor(
        'special-drop prompt open',
        (s: E2eSnapshot): boolean => s.hasPendingSpecialDrop,
      );

      await player.probe.knockOut();
      await expect(player.page.getByTestId('game-gameover-button-retry')).toBeVisible({
        timeout: 10_000,
      });
      await player.page.getByTestId('game-gameover-button-retry').click();
      const fresh: E2eSnapshot = await player.probe.waitFor(
        'new run started',
        (s: E2eSnapshot): boolean => s.player !== null && !s.player.isDead && s.floor === 1,
      );
      expect(fresh.hasPendingSpecialDrop, 'the new run starts without a prompt').toBe(false);
    },
  );

  test('low gravity does not let a double jump from the ground reach the floor-1 exit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const player: GamePlayer = await solo('assassin');
    await player.probe.setGodMode(true);
    const s0: E2eSnapshot = await player.probe.state();
    const exitCx: number = s0.exit.x + s0.exit.width / 2;
    const towardExit: string = exitCx > WORLD.width / 2 ? KEYS.right : KEYS.left;
    await player.probe.activateSpecialDrop('low-gravity');
    await player.probe.waitFor('low gravity on', (s: E2eSnapshot): boolean =>
      s.activeSpecialEffects.includes('low-gravity'),
    );

    // A few tries from the ground right under the exit, holding toward it, double jump at the apex.
    let highestFeet: number = WORLD.groundY;
    for (let attempt: number = 0; attempt < 3; attempt++) {
      await player.probe.teleport(
        exitCx - WORLD.playerWidth / 2,
        WORLD.groundY - WORLD.playerHeight,
      );
      await player.probe.waitFor(
        'standing under the exit',
        (s: E2eSnapshot): boolean => s.player!.isGrounded && feetY(s) === WORLD.groundY,
      );
      await player.hold(towardExit);
      await player.hold(KEYS.jump);
      let doubled: boolean = false;
      const end: number = Date.now() + 3_000;
      while (Date.now() < end) {
        const s: E2eSnapshot = await player.probe.state();
        if (s.floor > 1) break;
        highestFeet = Math.min(highestFeet, feetY(s));
        if (!doubled && s.player!.velocityY >= 0 && !s.player!.isGrounded) {
          await player.release(KEYS.jump);
          await player.press(KEYS.jump, 200);
          doubled = true;
        }
        await player.wait(20);
      }
      await player.releaseAll();
      if ((await player.probe.state()).floor > 1) break;
    }
    expect(
      (await player.probe.state()).floor,
      `still on floor 1 (highest feet y ${highestFeet}, exit top ${s0.exit.y})`,
    ).toBe(1);
    test.info().annotations.push({
      type: 'low-gravity jump',
      description: `highest feet y ${highestFeet}, exit top ${s0.exit.y}`,
    });
  });

  test(
    'down + jump on a box on the ground keeps the player standing on the box',
    { tag: '@bug' },
    async ({ solo }: { solo: SoloFactory }): Promise<void> => {
      test.fail(
        true,
        'KNOWN BUG: the drop-through skips every non-ground platform, solid props included; the player sinks into the box and is shoved out sideways',
      );
      test.setTimeout(90_000);
      const player: GamePlayer = await solo('warrior');
      await player.probe.setGodMode(true);
      const s0: E2eSnapshot = await layoutWhere(
        player,
        'a lone pickable prop on open ground',
        (s: E2eSnapshot): boolean => pickableOnGround(s) !== undefined,
      );
      const prop: LevelProp = pickableOnGround(s0)!;
      await player.probe.teleport(
        prop.x + prop.width / 2 - WORLD.playerWidth / 2,
        prop.y - WORLD.playerHeight - 2,
      );
      const standing: E2eSnapshot = await player.probe.waitFor(
        `standing on the ${prop.kind}`,
        (s: E2eSnapshot): boolean => s.player!.isGrounded && feetY(s) === prop.y,
      );
      const startX: number = standing.player!.x;

      await player.hold(KEYS.down);
      await player.press(KEYS.jump, 80);
      await player.wait(600);
      await player.release(KEYS.down);
      const after: E2eSnapshot = await player.probe.state();
      const now: LevelProp = findProp(after, prop.id!)!;
      expect(
        { feetY: feetY(after), dx: Math.round(after.player!.x - startX) },
        `${prop.kind} top ${now.y}; the player should not fall into it`,
      ).toEqual({ feetY: now.y, dx: 0 });
    },
  );

  test(
    'the auto-potion picked in the shop is the one auto-potion drinks',
    { tag: '@bug' },
    async ({ solo }: { solo: SoloFactory }): Promise<void> => {
      test.fail(
        true,
        'KNOWN BUG: onAutoPotionChanged updates only GameStateService, never the engine (no syncProgression); the next onPlayerUpdate copies the old choice back',
      );
      test.setTimeout(90_000);
      const player: GamePlayer = await solo('warrior');
      await player.probe.maxOutPlayer();
      await player.probe.setGodMode(true);
      const s0: E2eSnapshot = await player.probe.state();
      const safe: { x: number; y: number; width: number } = s0.level.safeSpot!;
      await player.probe.teleport(
        safe.x + safe.width / 2 - WORLD.playerWidth / 2,
        safe.y - WORLD.playerHeight,
      );
      await player.wait(500);

      await player.press(KEYS.openShop);
      await expect(
        player.page.getByTestId(`shop-item-button-buy-shop-${HP_POTION_2}`),
      ).toBeVisible();
      await player.page.getByTestId(`shop-item-button-buy-shop-${HP_POTION_2}`).click();
      await player.probe.waitFor(
        'bought a strong HP potion',
        (s: E2eSnapshot): boolean => (s.player!.potions[HP_POTION_2] ?? 0) > 0,
      );
      await player.page.getByTestId('shop-auto-select-hp').selectOption(HP_POTION_2);
      await player.page.getByTestId('shop-panel-button-close').click();
      await expect(player.page.locator('app-shop')).toBeHidden();

      const before: E2eSnapshot = await player.probe.state();
      const strong: number = before.player!.potions[HP_POTION_2] ?? 0;
      await player.probe.setGodMode(false);
      await player.probe.setVitals(Math.ceil(before.player!.maxHp * 0.1), before.player!.maxMp);
      const drank: E2eSnapshot = await player.probe.waitFor(
        'auto-potion drank',
        (s: E2eSnapshot): boolean => s.player!.hp > before.player!.maxHp * 0.2,
        { timeoutMs: 10_000 },
      );
      expect(drank.player!.potions[HP_POTION_2] ?? 0, 'the chosen potion was used').toBe(
        strong - 1,
      );

      await player.press(KEYS.openShop);
      await expect(player.page.getByTestId('shop-auto-select-hp')).toHaveValue(HP_POTION_2);
    },
  );
});
