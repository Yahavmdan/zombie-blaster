import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { vfxQueuedBy } from '../../support/vfx-gate';
import { WARRIOR, animationsIn, castSkill, cooldownOf, warriorArena, zombieAt } from '../../support/warrior';

/**
 * Gameplay corners no other spec reaches: a skill that kills, a skill key spammed, a potion on a
 * quick slot pressed twice.
 */

const HP_POTION: string = 'hp-potion-1';
const HP_POTION_RESTORE: number = 50;

function liveZombies(s: E2eSnapshot): E2eZombieView[] {
  return s.zombies.filter(
    (z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0 && z.type !== 'eater',
  );
}

async function middleClickCanvas(player: GamePlayer): Promise<void> {
  const box: { x: number; y: number; width: number; height: number } | null = await player.page
    .locator('app-game-canvas canvas')
    .boundingBox();
  await player.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * 0.4);
  await player.page.mouse.down({ button: 'middle' });
  await player.wait(60);
  await player.page.mouse.up({ button: 'middle' });
}

test.describe('gameplay edge cases', { tag: '@solo' }, (): void => {
  test('a skill that kills still costs its MP', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxOutPlayer();
    // Slash blast (double tap) on open ground; a maxed warrior kills a floor-1 walker outright.
    const x: number = await warriorArena(player, [WARRIOR.powerStrike, WARRIOR.slashBlast], false);

    const deadline: number = Date.now() + 60_000;
    let measured: { before: number; after: number } | null = null;
    while (Date.now() < deadline && measured === null) {
      await player.probe.waitFor(
        'slash blast ready',
        (st: E2eSnapshot): boolean => cooldownOf(st, WARRIOR.slashBlast) === 0,
        { timeoutMs: 5_000 },
      );
      const target: string = await zombieAt(player, x + 50);
      await player.face('right');
      const before: E2eSnapshot = await player.probe.state();
      await castSkill(player, WARRIOR.slashBlast, before);
      const after: E2eSnapshot = await player.probe.waitFor(
        'slash blast cast',
        (st: E2eSnapshot): boolean => cooldownOf(st, WARRIOR.slashBlast) > 0,
        { timeoutMs: 2_000 },
      );
      await player.wait(400);
      const settled: E2eSnapshot = await player.probe.state();
      const killed: boolean = !liveZombies(settled).some((z: E2eZombieView): boolean => z.id === target);
      if (killed && settled.player!.level === after.player!.level) {
        measured = { before: before.player!.mp, after: settled.player!.mp };
      }
    }
    expect(measured, 'a slash blast killed a zombie without levelling up').not.toBeNull();
    expect(
      measured!.after,
      `MP before ${measured!.before}, after the killing cast ${measured!.after}`,
    ).toBeLessThan(measured!.before);
  });

  test('mashing attack respects the slash blast cooldown', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const player: GamePlayer = await solo('warrior');
    await warriorArena(player, [WARRIOR.powerStrike, WARRIOR.slashBlast]);
    await castSkill(player, WARRIOR.slashBlast);
    const first: E2eSnapshot = await player.probe.waitFor(
      'the first slash blast starts its cooldown',
      (st: E2eSnapshot): boolean => cooldownOf(st, WARRIOR.slashBlast) > 0,
      { timeoutMs: 2_000 },
    );
    const cooldownMs: number = cooldownOf(first, WARRIOR.slashBlast) * 20;
    await player.probe.waitFor(
      'cooldown over',
      (st: E2eSnapshot): boolean => cooldownOf(st, WARRIOR.slashBlast) === 0,
      { timeoutMs: 10_000 },
    );

    const spamStart: number = Date.now();
    const queued: E2eVfxLogEntry[] = await vfxQueuedBy(
      player,
      async (): Promise<void> => {
        // Every quick pair of presses is a double tap.
        for (let i: number = 0; i < 30; i++) await player.attack();
      },
      0,
    );
    const elapsedMs: number = Date.now() - spamStart;
    const casts: number = animationsIn(queued).filter((k: string): boolean => k === WARRIOR.slashBlast).length;
    expect(casts, `${casts} slash blasts in ${elapsedMs}ms with a ${cooldownMs}ms cooldown`).toBeLessThanOrEqual(
      Math.floor(elapsedMs / cooldownMs) + 1,
    );
    expect(casts).toBeGreaterThanOrEqual(1);
  });

  test('a potion on a quick slot respects the potion cooldown', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const player: GamePlayer = await solo('warrior');
    await player.probe.maxOutPlayer();
    await player.page.getByTestId('game-settings-button-toggle').click();
    await player.page.getByTestId('game-settings-button-inventory').click();
    const item: Locator = player.page.getByTestId(`game-settings-item-${HP_POTION}`);
    await item.dragTo(player.page.getByTestId('game-settings-key-mousemiddle'));
    await expect(player.page.getByTestId('game-settings-key-mousemiddle')).toContainText(
      'HP Potion',
    );
    await player.page.getByTestId('game-settings-button-close').click();

    // Take enough damage for two potions, then rest on the safe spot.
    await player.probe.setGodMode(false);
    await player.probe.setFloor(6);
    const deadline: number = Date.now() + 90_000;
    let s: E2eSnapshot = await player.probe.state();
    while (Date.now() < deadline && s.player!.hp > s.player!.maxHp - 2 * HP_POTION_RESTORE - 20) {
      const z: E2eZombieView | undefined = liveZombies(s)[0];
      if (z) await player.probe.teleport(z.x, z.y + z.height - 48);
      await player.wait(300);
      s = await player.probe.state();
    }
    expect(s.player!.hp, 'took damage').toBeLessThan(s.player!.maxHp - 2 * HP_POTION_RESTORE);
    const safe: { x: number; y: number; width: number } = s.level.safeSpot!;
    await player.probe.teleport(safe.x + safe.width / 2 - 12, safe.y - 48);
    await player.wait(1_000);

    const potions: number = (await player.probe.state()).player!.potions[HP_POTION] ?? 0;
    await middleClickCanvas(player);
    await player.wait(100);
    await middleClickCanvas(player);
    await player.wait(150);
    const after: number = (await player.probe.state()).player!.potions[HP_POTION] ?? 0;
    expect(potions - after, 'two presses inside the 0.6 s potion cooldown drink one potion').toBe(
      1,
    );
  });
});
