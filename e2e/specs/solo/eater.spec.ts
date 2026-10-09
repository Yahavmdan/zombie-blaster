import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { LevelPlatform, levelPlatforms, mealGroundX } from '../../support/navigation';
import { WORLD } from '../../support/invariants';

/** Lying corpses that draw an Eater (ZOMBIE_EATER_SPAWN_MIN_CORPSES). */
const MEALS: number = 3;
const PILE_SPAN: number = 160;
/** Longest wait for the next Eater (ZOMBIE_EATER_SPAWN_DELAY_MAX_TICKS, 20 s) plus its rise. */
const EATER_ARRIVES_MS: number = 25_000;
/** An Eater eats a corpse in 2 s (ZOMBIE_EATER_EATING_TICKS). */
const MEAL_MS: number = 2_000;
/** Hit particles of an Eater biting a zombie (ZOMBIE_EATER_BITE_COLOR). */
const BITE_COLOR: string = '#b02a22';

function eaters(s: E2eSnapshot): E2eZombieView[] {
  return s.zombies.filter((z: E2eZombieView): boolean => z.type === 'eater' && !z.isDead);
}

test.describe('eater zombie', { tag: '@solo' }, (): void => {
  test('corpses draw an Eater on floor 1; it crawls over and eats each one in 2 s', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const start: E2eSnapshot = await p.probe.state();
    expect(start.floor).toBe(1);
    expect(eaters(start), 'no Eater before any corpse lies around').toHaveLength(0);

    let x: number | null = mealGroundX(start, PILE_SPAN);
    for (let seed: number = 1; x === null && seed <= 20; seed++) {
      await p.probe.setLayoutSeed(seed);
      await p.wait(300);
      x = mealGroundX(await p.probe.state(), PILE_SPAN);
    }
    expect(x, 'a floor layout with open ground').not.toBeNull();

    // Out of reach on the safe spot: the hungry Eater can only go for zombies.
    const spot: { x: number; y: number; width: number } = (await p.probe.state()).level.safeSpot!;
    await p.probe.teleport(
      spot.x + spot.width / 2 - WORLD.playerWidth / 2,
      spot.y - WORLD.playerHeight,
    );
    await p.probe.waitFor('the player rests on the safe spot', (s: E2eSnapshot): boolean =>
      s.restingPlayerIds.includes(s.player!.id),
    );

    const known: Set<string> = new Set<string>(
      start.corpseViews.map((c: E2eCorpseView): string => c.id),
    );
    const meals: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
      s.corpseViews.filter((c: E2eCorpseView): boolean => !known.has(c.id));
    await p.probe.dropCorpses(x! + PILE_SPAN / 2, MEALS);
    await p.probe.waitFor(
      `the ${MEALS} corpses land`,
      (s: E2eSnapshot): boolean =>
        meals(s).filter((c: E2eCorpseView): boolean => c.isGrounded).length === MEALS,
      { timeoutMs: 15_000 },
    );

    const arrived: E2eSnapshot = await p.probe.waitFor(
      'an Eater comes for the corpses',
      (s: E2eSnapshot): boolean => eaters(s).length > 0,
      { timeoutMs: EATER_ARRIVES_MS },
    );
    expect(eaters(arrived), 'one Eater, not a horde').toHaveLength(1);

    const eating: E2eSnapshot = await p.probe.waitFor(
      'the Eater reaches a corpse and eats',
      (s: E2eSnapshot): boolean => eaters(s).some((z: E2eZombieView): boolean => z.eating),
      { timeoutMs: 30_000 },
    );
    const startedAt: number = Date.now();
    const lying: number = meals(eating).length;
    await p.probe.waitFor('it shows the eating animation', (s: E2eSnapshot): boolean =>
      eaters(s).some((z: E2eZombieView): boolean => z.eating && z.animState === 'eating'),
    );
    await p.attachCanvas(testInfo, 'eater eating');

    await p.probe.waitFor(
      'the corpse it eats is gone',
      (s: E2eSnapshot): boolean => meals(s).length < lying,
      { timeoutMs: MEAL_MS * 3 },
    );
    const mealMs: number = Date.now() - startedAt;
    expect(mealMs, 'about 2 s of eating').toBeGreaterThan(MEAL_MS * 0.7);
    expect(mealMs, 'about 2 s of eating').toBeLessThan(MEAL_MS * 1.6);

    await p.probe.waitFor(
      'it goes on to eat the rest',
      (s: E2eSnapshot): boolean => meals(s).length === 0,
      { timeoutMs: 30_000 },
    );

    // Nothing left to eat: it turns on the other zombies, and its bites show.
    await p.probe.clearVfxLog();
    await p.probe.waitFor(
      'the hungry Eater attacks a zombie',
      (s: E2eSnapshot): boolean => eaters(s).some((z: E2eZombieView): boolean => z.isAttacking),
      { timeoutMs: 30_000 },
    );
    const bites: (log: E2eVfxLogEntry[]) => E2eVfxLogEntry[] = (
      log: E2eVfxLogEntry[],
    ): E2eVfxLogEntry[] =>
      log.filter(
        (e: E2eVfxLogEntry): boolean => e.type === 'hit-particles' && e.color === BITE_COLOR,
      );
    const deadline: number = Date.now() + 15_000;
    while (bites(await p.probe.vfxLog()).length === 0 && Date.now() < deadline) await p.wait(200);
    expect(
      bites(await p.probe.vfxLog()).length,
      'its bite queued for every player',
    ).toBeGreaterThan(0);
    await p.attachCanvas(testInfo, 'hungry eater bites a zombie');
  });

  test('it climbs onto a ledge to eat the corpses lying up there', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    const spot: { x: number; y: number; width: number } = s0.level.safeSpot!;
    const ledges: LevelPlatform[] = levelPlatforms(s0).filter(
      (pl: LevelPlatform): boolean =>
        // A regular ledge (the safe spot sits higher: zombies never go up there).
        pl.y < WORLD.groundY &&
        pl.y > spot.y &&
        pl.width >= 128 &&
        // Not over the exit's column (Eaters leave the pile there alone).
        (pl.x >= s0.exitPile.columnRight || pl.x + pl.width <= s0.exitPile.columnLeft),
    );
    expect(ledges.length, 'a ledge above the ground').toBeGreaterThan(0);
    const ledge: LevelPlatform = ledges[0];

    await p.probe.teleport(
      spot.x + spot.width / 2 - WORLD.playerWidth / 2,
      spot.y - WORLD.playerHeight,
    );
    const known: Set<string> = new Set<string>(
      s0.corpseViews.map((c: E2eCorpseView): string => c.id),
    );
    const upThere: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
      s.corpseViews.filter(
        (c: E2eCorpseView): boolean =>
          !known.has(c.id) && c.isGrounded && c.footY < WORLD.groundY - 20,
      );
    await p.probe.dropCorpses(ledge.x + ledge.width / 2, MEALS);
    await p.probe.waitFor(
      'the corpses land up on the ledge',
      (s: E2eSnapshot): boolean => upThere(s).length === MEALS,
      { timeoutMs: 15_000 },
    );

    await p.probe.waitFor(
      'an Eater climbs up and eats one',
      (s: E2eSnapshot): boolean => upThere(s).length < MEALS,
      { timeoutMs: EATER_ARRIVES_MS + 30_000 },
    );
  });

  test('the pile under the exit and corpses on the safe spot are no food: they draw no Eater', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    const spot: { x: number; y: number; width: number } = s0.level.safeSpot!;
    await p.probe.teleport(spot.x + 4, spot.y - WORLD.playerHeight);
    await p.probe.dropCorpses(s0.exitPile.centerX, MEALS);
    await p.probe.dropCorpses(spot.x + spot.width - 30, MEALS);
    const landed: E2eSnapshot = await p.probe.waitFor(
      'all the corpses land',
      (s: E2eSnapshot): boolean =>
        s.corpseViews.filter((c: E2eCorpseView): boolean => c.isGrounded).length === MEALS * 2,
      { timeoutMs: 15_000 },
    );
    await p.wait(EATER_ARRIVES_MS);
    const later: E2eSnapshot = await p.probe.state();
    expect(eaters(later), 'no Eater came for them').toHaveLength(0);
    expect(later.corpses, 'none eaten').toBe(landed.corpses);
  });
});
