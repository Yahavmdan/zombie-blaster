import { Locator } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot, E2eZombieView } from '../../support/probe';

/**
 * Gameplay corners no other spec reaches: a skill that kills, a potion on a quick slot pressed
 * twice.
 */

const HP_POTION: string = 'hp-potion-1';
const HP_POTION_RESTORE: number = 50;

function liveZombies(s: E2eSnapshot): E2eZombieView[] {
  return s.zombies.filter(
    (z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0 && z.type !== 'eater',
  );
}

/** Teleports beside the nearest grounded zombie, facing it. */
async function standNextTo(player: GamePlayer, z: E2eZombieView): Promise<void> {
  await player.probe.teleport(z.x - 40, z.y + z.height - 48);
  await player.face('right');
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
    await player.probe.setGodMode(false);
    const strike: E2eSkillView | undefined = (await player.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.id === 'warrior-slash-blast',
    );
    expect(strike, 'slash blast is usable after maxing out').toBeDefined();

    const deadline: number = Date.now() + 60_000;
    let measured: { before: number; after: number } | null = null;
    while (Date.now() < deadline && measured === null) {
      const s: E2eSnapshot = await player.probe.state();
      const target: E2eZombieView | undefined = liveZombies(s)[0];
      if (
        !target ||
        s.usableSkills.find((k: E2eSkillView): boolean => k.id === strike!.id)!.cooldownTicks > 0
      ) {
        await player.wait(300);
        continue;
      }
      await standNextTo(player, target);
      const before: E2eSnapshot = await player.probe.state();
      const kills0: Set<string> = new Set<string>(
        liveZombies(before).map((z: E2eZombieView): string => z.id),
      );
      await player.castSkill(strike!.slot);
      const after: E2eSnapshot = await player.probe.waitFor(
        'skill cast',
        (st: E2eSnapshot): boolean =>
          st.usableSkills.find((k: E2eSkillView): boolean => k.id === strike!.id)!.cooldownTicks >
          0,
        { timeoutMs: 2_000 },
      );
      await player.wait(400);
      const settled: E2eSnapshot = await player.probe.state();
      const killed: boolean = [...kills0].some(
        (id: string): boolean =>
          !liveZombies(settled).some((z: E2eZombieView): boolean => z.id === id),
      );
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
