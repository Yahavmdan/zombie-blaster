import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';
import {
  currentPlatform,
  GROUND,
  LevelPlatform,
  LevelRope,
  levelPlatforms,
  levelRopes,
  NavResult,
  stepToward,
} from '../../support/navigation';
import { WORLD } from '../../support/invariants';

type SafeSpot = NonNullable<E2eSnapshot['level']['safeSpot']>;

function safeSpotOf(s: E2eSnapshot): SafeSpot {
  expect(s.level.safeSpot, `floor ${s.floor} has a safe spot`).not.toBeNull();
  return s.level.safeSpot!;
}

function spotPlatform(s: E2eSnapshot): LevelPlatform {
  const spot: SafeSpot = safeSpotOf(s);
  return levelPlatforms(s).find(
    (pl: LevelPlatform): boolean => pl.x === spot.x && pl.y === spot.y,
  )!;
}

/** Climbs to the safe spot with real key input (walk, jump, ladder). */
async function climbToSafeSpot(p: GamePlayer, timeoutMs: number): Promise<E2eSnapshot> {
  const end: number = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s: E2eSnapshot = await p.probe.state();
    const target: LevelPlatform = spotPlatform(s);
    const result: NavResult = await stepToward(p, s, target, target.x + target.width / 2);
    if (result === 'arrived') {
      await p.releaseAll();
      return s;
    }
    await p.wait(40);
  }
  await p.releaseAll();
  throw new Error('never reached the safe spot');
}

/**
 * Every floor has a safe spot: a high ledge with its own ladder where players rest to sort out
 * stats, skills and the shop. Zombies can't stand on it or hurt anyone on it, and nobody attacks
 * from it. (Menus no longer shield you anywhere else: you earn the rest by getting up there.)
 */
test.describe('safe spot', { tag: '@solo' }, (): void => {
  test('every floor has one, high up on the far side from the exit, with its own ladder', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    for (const floor of [1, 2, 3, 4]) {
      if (floor > 1) await p.probe.setFloor(floor);
      const s: E2eSnapshot = await p.probe.waitFor(
        `floor ${floor}`,
        (st: E2eSnapshot): boolean => st.floor === floor,
      );
      const spot: SafeSpot = safeSpotOf(s);
      const highestTier: number = Math.min(
        ...s.level.platforms
          .filter((pl: { y: number }): boolean => pl.y !== spot.y)
          .map((pl: { y: number }): number => pl.y),
      );
      expect(spot.y, `floor ${floor}: above every other platform`).toBeLessThan(highestTier);
      const ladder: LevelRope | undefined = levelRopes(s).find(
        (r: LevelRope): boolean => r.topY === spot.y && r.x >= spot.x && r.x <= spot.x + spot.width,
      );
      expect(ladder, `floor ${floor}: a ladder up to it`).toBeDefined();
      const exitCx: number = s.exit.x + s.exit.width / 2;
      expect(
        Math.abs(spot.x + spot.width / 2 - exitCx),
        `floor ${floor}: far from the exit`,
      ).toBeGreaterThan(WORLD.width / 3);
    }
  });

  test('climb the ladder up: zombies stop hunting you and nothing hurts you there', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.levelUp(4);
    await p.probe.setFloor(3);
    await p.probe.waitFor('floor 3', (s: E2eSnapshot): boolean => s.floor === 3);
    // God mode only for the trip up; the rest is measured without it.
    await p.probe.setGodMode(true);
    await climbToSafeSpot(p, 90_000);
    const up: E2eSnapshot = await p.probe.waitFor(
      'resting on the safe spot',
      (s: E2eSnapshot): boolean => s.restingPlayerIds.includes(s.player!.id),
    );
    const spot: SafeSpot = safeSpotOf(up);
    expect(currentPlatform(up)?.y, 'standing on the safe spot').toBe(spot.y);
    await p.probe.setGodMode(false);
    const hp0: number = up.player!.hp;
    let zombiesSeen: number = 0;
    const end: number = Date.now() + 12_000;
    while (Date.now() < end) {
      const s: E2eSnapshot = await p.probe.state();
      expect(s.player!.hp, 'no damage while resting').toBeGreaterThanOrEqual(hp0);
      expect(s.restingPlayerIds).toContain(s.player!.id);
      const live: E2eZombieView[] = s.zombies.filter(
        (z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0,
      );
      zombiesSeen = Math.max(zombiesSeen, live.length);
      for (const z of live) {
        const onSpot: boolean =
          Math.abs(z.y + z.height - spot.y) < 3 &&
          z.x + z.width > spot.x &&
          z.x < spot.x + spot.width;
        expect(onSpot, `zombie ${z.id} never stands on the safe spot`).toBe(false);
      }
      await p.wait(200);
    }
    await p.attachCanvas(testInfo, 'resting on the safe spot');
    expect(zombiesSeen, 'zombies were around the whole time').toBeGreaterThan(0);
  });

  test('weapons down up there: no attacks or attack skills; back on the ground they work', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.probe.levelUp(2);
    await p.probe.maxAllSkills();
    const s0: E2eSnapshot = await p.probe.waitFor('power strike ready', (s: E2eSnapshot): boolean =>
      s.usableSkills.some(
        (k: E2eSnapshot['usableSkills'][number]): boolean => k.id === 'warrior-power-strike',
      ),
    );
    const strike: E2eSnapshot['usableSkills'][number] = s0.usableSkills.find(
      (k: E2eSnapshot['usableSkills'][number]): boolean => k.id === 'warrior-power-strike',
    )!;
    const spot: SafeSpot = safeSpotOf(s0);
    await p.probe.teleport(
      spot.x + spot.width / 2 - WORLD.playerWidth / 2,
      spot.y - WORLD.playerHeight,
    );
    await p.probe.waitFor(
      'resting',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.restingPlayerIds.includes(s.player!.id),
    );

    const attackedWhile: (
      pressKey: string,
    ) => Promise<{ attacked: boolean; cooldown: number }> = async (
      pressKey: string,
    ): Promise<{ attacked: boolean; cooldown: number }> => {
      await p.hold(pressKey);
      let attacked: boolean = false;
      let cooldown: number = 0;
      const end: number = Date.now() + 500;
      while (Date.now() < end) {
        const s: E2eSnapshot = await p.probe.state();
        attacked = attacked || s.player!.isAttacking;
        const k: E2eSnapshot['usableSkills'][number] | undefined = s.usableSkills.find(
          (u: E2eSnapshot['usableSkills'][number]): boolean => u.id === strike.id,
        );
        cooldown = Math.max(cooldown, k?.cooldownTicks ?? 0);
        await p.wait(30);
      }
      await p.release(pressKey);
      return { attacked, cooldown };
    };

    expect((await attackedWhile(KEYS.attack)).attacked, 'no swing from the safe spot').toBe(false);
    expect((await attackedWhile(String(strike.slot))).cooldown, 'power strike does not fire').toBe(
      0,
    );

    await p.probe.teleport(spot.x, GROUND.y - WORLD.playerHeight - 40);
    await p.probe.waitFor(
      'back on the ground',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && !s.restingPlayerIds.includes(s.player!.id),
    );
    expect((await attackedWhile(KEYS.attack)).attacked, 'swings again on the ground').toBe(true);
  });
});
