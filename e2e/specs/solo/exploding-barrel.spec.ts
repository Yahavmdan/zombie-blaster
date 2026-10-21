import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import {
  E2eCorpseView,
  E2ePlayerView,
  E2eSnapshot,
  E2eVfxLogEntry,
  E2eZombieView,
} from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';
import { layoutWhere } from '../../support/navigation';
import {
  dropLyingCorpses,
  findProp,
  isBarrel,
  LevelProp,
  pickableOnGround,
  propCenterX,
  standLeftOf,
} from '../../support/props';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

/** Mirrors BARREL_FUSE_TICKS in shared/game-constants.ts: 3 s at 50 ticks/s. */
const FUSE_TICKS: number = 150;
/** Mirrors BARREL_BLAST_PLAYER_DAMAGE_PERCENT in shared/game-constants.ts (point blank). */
const BLAST_PLAYER_PERCENT: number = 40;
/** Zombies spawned this many ticks before the blast are still climbing out (ZOMBIE_SPAWN_ANIM_TICKS 50): they stay put. */
const SPAWN_BEFORE_BLAST_TICKS: number = 35;
/** God mode goes off this many ticks before the blast (well under a zombie's ~1.8 s i-frames). */
const MORTAL_TICKS: number = 25;

test.describe('exploding barrels', { tag: '@solo' }, (): void => {
  test('a hit lights a barrel: its fuse counts down 3 s, then it blows up and is gone', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(130_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    await standLeftOf(p, barrel);

    const lighting: E2eVfxLogEntry[] = await vfxQueuedBy(p, async (): Promise<void> => {
      await p.press(KEYS.attack, 70);
    });
    const lit: E2eSnapshot = await p.probe.waitFor(
      'the hit lights the fuse',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
    );
    const litAt: number = Date.now();
    expect(typesOf(lighting), 'sparks as the fuse catches, queued for the others').toContain(
      'hit-particles',
    );
    expect(findProp(lit, id)!.fuseTicks).toBeGreaterThan(FUSE_TICKS - 40);
    await p.attachCanvas(testInfo, 'lit barrel counting down');

    // Halfway: still there, still burning.
    await p.wait(1_200);
    const burning: LevelProp | undefined = findProp(await p.probe.state(), id);
    expect(burning?.exploded).toBe(false);
    expect(burning?.fuseTicks).toBeGreaterThan(0);
    expect(burning!.fuseTicks).toBeLessThan(FUSE_TICKS - 40);

    await p.probe.waitFor(
      'the barrel blows up',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    const blewAt: number = Date.now();
    expect(blewAt - litAt, 'about 3 s after the hit').toBeGreaterThan(2_000);
    await p.attachCanvas(testInfo, 'barrel blowing up');
    const blast: E2eVfxLogEntry | undefined = (await p.probe.vfxLog()).find(
      (e: E2eVfxLogEntry): boolean => e.type === 'barrel-blast',
    );
    expect(blast, 'the blast is queued for the other players').toBeDefined();
    await p.wait(250);
    await p.attachCanvas(testInfo, 'fireball and shockwave');

    // Gone from the world: what is drawn is still exactly what is solid.
    expectArtMatchesCollision(await drawnGeometry(p, 'after the blast'), 'after the blast');

    // 45 s later (BARREL_RESPAWN_TICKS) it is back where the floor first put it, unlit.
    const back: E2eSnapshot = await p.probe.waitFor(
      'the barrel is back on its spawn spot',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === false,
      { timeoutMs: 60_000 },
    );
    expect(Date.now() - blewAt, 'about 45 s after the blast').toBeGreaterThan(43_000);
    expect(findProp(back, id)).toMatchObject({
      x: barrel.x,
      y: barrel.y,
      fuseTicks: 0,
      pickable: true,
      isGrounded: true,
    });
    expect(
      (await p.probe.vfxLog()).some((e: E2eVfxLogEntry): boolean => e.type === 'barrel-respawn'),
      'its return is queued for the other players',
    ).toBe(true);
    await p.attachCanvas(testInfo, 'barrel back');
    expectArtMatchesCollision(await drawnGeometry(p, 'barrel back'), 'barrel back');
  });

  test('the blast hurts and throws the player who lit it and flings the corpses lying beside it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    const corpses: E2eCorpseView[] = await dropLyingCorpses(p, [], propCenterX(barrel) + 60, 2);
    await standLeftOf(p, barrel);
    await p.press(KEYS.attack, 70);
    await p.probe.waitFor(
      'the hit lights the fuse',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
    );
    // Mortal only for the fuse's last moment: a zombie hit before it would leave the player
    // invincible through the blast.
    await p.probe.waitFor(
      'the fuse is almost out',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) <= MORTAL_TICKS,
      { timeoutMs: 5_000 },
    );
    await p.probe.clearZombies();
    await p.probe.setGodMode(false);
    const before: E2ePlayerView = (await p.probe.state()).player!;
    await p.probe.setVitals(before.maxHp, before.mp);

    await p.probe.waitFor(
      'the barrel blows up',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    const thrown: E2eSnapshot = await p.probe.waitFor(
      'the blast throws the player back, away from the barrel',
      (s: E2eSnapshot): boolean => s.player!.x < before.x - 30,
      { timeoutMs: 3_000 },
    );
    expect(thrown.player!.hp, `${BLAST_PLAYER_PERCENT}% of max HP (a zombie could only take more)`).toBeLessThanOrEqual(
      before.maxHp - Math.ceil((before.maxHp * BLAST_PLAYER_PERCENT) / 100),
    );
    expect(thrown.player!.tint.hurtTicks, 'flashes hurt').toBeGreaterThan(0);
    await p.attachCanvas(testInfo, 'player thrown by the blast');

    await p.probe.waitFor(
      'the corpses fly off away from the barrel and land again',
      (s: E2eSnapshot): boolean =>
        corpses.every((c: E2eCorpseView): boolean => {
          const now: E2eCorpseView | undefined = s.corpseViews.find(
            (v: E2eCorpseView): boolean => v.id === c.id,
          );
          return now !== undefined && now.isGrounded && now.x > c.x + 30;
        }),
      { timeoutMs: 5_000 },
    );
    await p.attachCanvas(testInfo, 'corpses thrown by the blast');
  });

  test('the blast is far worse up close: a zombie beside the barrel dies, one near the edge is only singed', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    await standLeftOf(p, barrel);
    await p.press(KEYS.attack, 70);
    await p.probe.waitFor(
      'the hit lights the fuse',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
    );
    await p.probe.clearZombies();
    await p.probe.waitFor(
      'the fuse is almost out',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) <= SPAWN_BEFORE_BLAST_TICKS,
      { timeoutMs: 5_000 },
    );
    // One zombie right on the barrel, one near the edge of the blast (radius 110).
    const cx: number = propCenterX(barrel);
    await p.probe.spawnZombieAt(cx);
    await p.probe.spawnZombieAt(cx + 90);
    const spawned: E2eSnapshot = await p.probe.state();
    const closest: (x: number) => E2eZombieView = (x: number): E2eZombieView =>
      spawned.zombies.reduce(
        (best: E2eZombieView, z: E2eZombieView): E2eZombieView =>
          Math.abs(z.x + z.width / 2 - x) < Math.abs(best.x + best.width / 2 - x) ? z : best,
      );
    const near: E2eZombieView = closest(cx);
    const far: E2eZombieView = closest(cx + 90);
    expect(near.id).not.toBe(far.id);

    await p.probe.waitFor(
      'the barrel blows up',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 5_000 },
    );
    const after: E2eSnapshot = await p.probe.state();
    const nearAfter: E2eZombieView | undefined = after.zombies.find(
      (z: E2eZombieView): boolean => z.id === near.id,
    );
    const farAfter: E2eZombieView | undefined = after.zombies.find(
      (z: E2eZombieView): boolean => z.id === far.id,
    );
    expect(
      nearAfter === undefined || nearAfter.isDead || nearAfter.hp <= 0,
      'point blank: the whole of its HP',
    ).toBe(true);
    expect(farAfter, 'the edge zombie lives').toBeDefined();
    expect(farAfter!.isDead).toBe(false);
    const farLost: number = (far.hp - farAfter!.hp) / far.maxHp;
    expect(farLost, 'near the edge: only a small share of its HP').toBeGreaterThan(0.1);
    expect(farLost, 'near the edge: only a small share of its HP').toBeLessThan(0.4);
    await p.attachCanvas(testInfo, 'near zombie killed, far one singed');
  });

  test('every floor has 5 to 10 barrels', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    for (const floor of [1, 2, 3, 4, 5, 6]) {
      if (floor > 1) await p.probe.setFloor(floor);
      const s: E2eSnapshot = await p.probe.waitFor(
        `floor ${floor}`,
        (st: E2eSnapshot): boolean => st.floor === floor,
      );
      const barrels: number = s.level.props.filter(isBarrel).length;
      expect(barrels, `floor ${floor}`).toBeGreaterThanOrEqual(5);
      expect(barrels, `floor ${floor}`).toBeLessThanOrEqual(10);
    }
  });

  test('boxes are not explosive: a hit leaves them unlit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const isBox: (q: LevelProp) => boolean = (q: LevelProp): boolean => !isBarrel(q);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone box on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBox) !== undefined,
    );
    const box: LevelProp = pickableOnGround(s0, isBox)!;
    await standLeftOf(p, box);
    await p.press(KEYS.attack, 70);
    await p.wait(600);
    const after: LevelProp | undefined = findProp(await p.probe.state(), box.id!);
    expect(after?.fuseTicks).toBe(0);
    expect(after?.exploded).toBe(false);
  });
});
