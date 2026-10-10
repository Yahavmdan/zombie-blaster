import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';

/**
 * Zombie types (ZOMBIE_TYPES + the spawn roll in zombie-system.ts): runners from floor 2, tanks
 * from 3, spitters from 4, a boss on every 5th floor, the dragon on every 10th, one boss at a time.
 * `spawnRolledZombies` runs the regular spawn roll many times at once (no timer, no alive cap) so
 * rare types show up quickly; it never picks a type itself.
 */

/** Mirrors GROUND_Y and DRAGON_HOVER_Y_OFFSET in shared/game-constants.ts. */
const GROUND_Y: number = 620;
const DRAGON_HOVER_Y_OFFSET: number = 140;
/** Mirrors DRAGON_ATTACK_RANGE: the dragon breathes fire at players within this distance. */
const DRAGON_ATTACK_RANGE: number = 350;
const BATCH: number = 30;

type TypeCounts = Record<string, number>;

/** Regular spawns only: Eaters come from corpses, never from the roll. */
function rolled(s: E2eSnapshot): E2eZombieView[] {
  return s.zombies.filter((z: E2eZombieView): boolean => !z.isDead && z.type !== 'eater');
}

function countTypes(zombies: E2eZombieView[]): TypeCounts {
  const counts: TypeCounts = {};
  for (const z of zombies) counts[z.type] = (counts[z.type] ?? 0) + 1;
  return counts;
}

function ofType(s: E2eSnapshot, type: string): E2eZombieView[] {
  return rolled(s).filter((z: E2eZombieView): boolean => z.type === type);
}

function bosses(s: E2eSnapshot): E2eZombieView[] {
  return rolled(s).filter(
    (z: E2eZombieView): boolean => z.type === 'boss' || z.type === 'dragon-boss',
  );
}

/** A fresh floor (no zombies) with `count` regular spawns rolled on it. */
async function freshFloorWithRolls(
  player: GamePlayer,
  floor: number,
  count: number,
): Promise<E2eSnapshot> {
  await player.probe.setFloor(floor);
  await player.probe.waitFor(`floor ${floor}`, (s: E2eSnapshot): boolean => s.floor === floor);
  await player.probe.spawnRolledZombies(count);
  return player.probe.state();
}

/** Rolls `rounds` fresh batches on a floor and adds up the types (and the most bosses alive at once). */
async function rollMany(
  player: GamePlayer,
  floor: number,
  rounds: number,
): Promise<{ counts: TypeCounts; maxBossesAlive: number }> {
  const counts: TypeCounts = {};
  let maxBossesAlive: number = 0;
  for (let i: number = 0; i < rounds; i++) {
    const s: E2eSnapshot = await freshFloorWithRolls(player, floor, BATCH);
    for (const [type, n] of Object.entries(countTypes(rolled(s)))) {
      counts[type] = (counts[type] ?? 0) + n;
    }
    maxBossesAlive = Math.max(maxBossesAlive, bosses(s).length);
  }
  return { counts, maxBossesAlive };
}

/** Rolls batches on fresh copies of `floor` until `pred` holds for the zombies there. */
async function rollUntil(
  player: GamePlayer,
  floor: number,
  description: string,
  pred: (s: E2eSnapshot) => boolean,
  maxRounds: number = 40,
): Promise<E2eSnapshot> {
  for (let i: number = 0; i < maxRounds; i++) {
    const s: E2eSnapshot = await freshFloorWithRolls(player, floor, BATCH);
    if (pred(s)) return s;
  }
  throw new Error(`floor ${floor}: never rolled ${description} in ${maxRounds * BATCH} spawns`);
}

/** Fastest each zombie moved over ~0.5 s windows (px/s), sampled for `durationMs`. */
async function topSpeeds(player: GamePlayer, durationMs: number): Promise<Map<string, number>> {
  const tracks: Map<string, Array<{ t: number; x: number }>> = new Map<
    string,
    Array<{ t: number; x: number }>
  >();
  const end: number = Date.now() + durationMs;
  while (Date.now() < end) {
    const s: E2eSnapshot = await player.probe.state();
    for (const z of rolled(s)) {
      if (z.spawnTimer > 0) continue;
      const track: Array<{ t: number; x: number }> = tracks.get(z.id) ?? [];
      track.push({ t: s.at, x: z.x });
      tracks.set(z.id, track);
    }
    await player.wait(80);
  }
  const speeds: Map<string, number> = new Map<string, number>();
  for (const [id, track] of tracks) {
    let best: number = 0;
    for (let i: number = 0; i < track.length; i++) {
      for (let j: number = i + 1; j < track.length; j++) {
        const dt: number = track[j].t - track[i].t;
        if (dt < 400) continue;
        if (dt > 700) break;
        best = Math.max(best, (Math.abs(track[j].x - track[i].x) / dt) * 1000);
      }
    }
    speeds.set(id, best);
  }
  return speeds;
}

function median(values: number[]): number {
  const sorted: number[] = [...values].sort((a: number, b: number): number => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

test.describe('zombie types', { tag: '@solo' }, (): void => {
  let player: GamePlayer;

  test.beforeEach(async ({ solo }: { solo: SoloFactory }): Promise<void> => {
    player = await solo('warrior');
    await player.probe.setGodMode(true);
  });

  test('each floor rolls only the types it should', async ({}: object, testInfo: TestInfo): Promise<void> => {
    const byFloor: Record<number, TypeCounts> = {};
    for (const floor of [1, 2, 3, 4]) {
      byFloor[floor] = (await rollMany(player, floor, 4)).counts;
    }
    await testInfo.attach('types rolled per floor (120 spawns each)', {
      body: JSON.stringify(byFloor, null, 2),
      contentType: 'application/json',
    });
    expect(Object.keys(byFloor[1]), 'floor 1: walkers only').toEqual(['walker']);
    expect(Object.keys(byFloor[2]).sort(), 'floor 2: runners join').toEqual(['runner', 'walker']);
    expect(Object.keys(byFloor[3]).sort(), 'floor 3: tanks join').toEqual([
      'runner',
      'tank',
      'walker',
    ]);
    expect(Object.keys(byFloor[4]).sort(), 'floor 4: spitters join, still no boss').toEqual([
      'runner',
      'spitter',
      'tank',
      'walker',
    ]);
  });

  test('runners chase faster than walkers', async ({}: object, testInfo: TestInfo): Promise<void> => {
    await rollUntil(
      player,
      2,
      'two runners and two walkers',
      (s: E2eSnapshot): boolean =>
        ofType(s, 'runner').length >= 2 && ofType(s, 'walker').length >= 2,
    );
    const types: Map<string, string> = new Map<string, string>(
      rolled(await player.probe.state()).map((z: E2eZombieView): [string, string] => [
        z.id,
        z.type,
      ]),
    );
    const speeds: Map<string, number> = await topSpeeds(player, 5_000);
    const byType: (type: string) => number[] = (type: string): number[] =>
      [...speeds.entries()]
        .filter(([id]: [string, number]): boolean => types.get(id) === type)
        .map(([, v]: [string, number]): number => v);
    const runner: number = median(byType('runner'));
    const walker: number = median(byType('walker'));
    await testInfo.attach('top speeds px/s', {
      body: JSON.stringify({ runner: byType('runner'), walker: byType('walker') }),
      contentType: 'application/json',
    });
    // Rolled speeds: walker 0.4-0.8 px/tick (20-40 px/s), runner 1.4-2.3 (70-115 px/s).
    expect(runner, `runner median ${runner} vs walker median ${walker} px/s`).toBeGreaterThan(
      walker * 1.5,
    );
  });

  test('tanks take far more hits than walkers', async (): Promise<void> => {
    const s: E2eSnapshot = await rollUntil(
      player,
      3,
      'a tank and a walker',
      (st: E2eSnapshot): boolean =>
        ofType(st, 'tank').length >= 1 && ofType(st, 'walker').length >= 1,
    );
    const weakestTank: number = Math.min(
      ...ofType(s, 'tank').map((z: E2eZombieView): number => z.maxHp),
    );
    const toughestWalker: number = Math.max(
      ...ofType(s, 'walker').map((z: E2eZombieView): number => z.maxHp),
    );
    expect(weakestTank, 'every tank has more HP than any walker').toBeGreaterThan(toughestWalker);
  });

  test('spitters shoot at the player from range, melee types never do', async (): Promise<void> => {
    // Floor 3 has no spitters: a crowd chasing the player fires nothing.
    await freshFloorWithRolls(player, 3, 15);
    const end: number = Date.now() + 4_000;
    while (Date.now() < end) {
      const s: E2eSnapshot = await player.probe.state();
      expect(s.zombieProjectiles.spitter, 'no spitter, no acid').toBe(0);
      await player.wait(150);
    }

    await rollUntil(
      player,
      4,
      'a spitter',
      (s: E2eSnapshot): boolean => ofType(s, 'spitter').length >= 1,
    );
    await player.probe.waitFor(
      'a spitter shot in flight',
      (s: E2eSnapshot): boolean => s.zombieProjectiles.spitter > 0,
      { timeoutMs: 15_000 },
    );
  });

  test('a boss comes on floor 5, never before, and only one at a time', async (): Promise<void> => {
    const floor4: { counts: TypeCounts; maxBossesAlive: number } = await rollMany(player, 4, 5);
    expect(floor4.counts['boss'] ?? 0, 'no boss on floor 4').toBe(0);

    const s: E2eSnapshot = await rollUntil(
      player,
      5,
      'a boss',
      (st: E2eSnapshot): boolean => bosses(st).length > 0,
    );
    expect(ofType(s, 'dragon-boss'), 'no dragon on floor 5').toHaveLength(0);
    expect(bosses(s), 'one boss at a time').toHaveLength(1);
    await player.probe.spawnRolledZombies(BATCH);
    const more: E2eSnapshot = await player.probe.state();
    expect(bosses(more), 'still one boss after more spawns').toHaveLength(1);

    const boss: E2eZombieView = bosses(more)[0];
    const others: E2eZombieView[] = rolled(more).filter(
      (z: E2eZombieView): boolean => z.id !== boss.id,
    );
    expect(boss.maxHp, 'the boss outlasts any zombie').toBeGreaterThan(
      Math.max(...others.map((z: E2eZombieView): number => z.maxHp)),
    );
    expect(boss.height, 'and towers over them').toBeGreaterThan(
      Math.max(...others.map((z: E2eZombieView): number => z.height)),
    );
  });

  test('the dragon comes on floor 10, hovers and breathes fire', async ({}: object, testInfo: TestInfo): Promise<void> => {
    await rollUntil(
      player,
      10,
      'the dragon',
      (s: E2eSnapshot): boolean => ofType(s, 'dragon-boss').length > 0,
    );
    const dragonId: string = ofType(await player.probe.state(), 'dragon-boss')[0].id;
    const hovering: E2eSnapshot = await player.probe.waitFor(
      'the dragon up in the air',
      (s: E2eSnapshot): boolean => {
        const d: E2eZombieView | undefined = s.zombies.find(
          (z: E2eZombieView): boolean => z.id === dragonId,
        );
        return (
          d !== undefined &&
          d.spawnTimer <= 0 &&
          d.y + d.height <= GROUND_Y - DRAGON_HOVER_Y_OFFSET / 2
        );
      },
      { timeoutMs: 10_000 },
    );
    const dragon: E2eZombieView = hovering.zombies.find(
      (z: E2eZombieView): boolean => z.id === dragonId,
    )!;
    expect(bosses(hovering), 'no second boss beside the dragon').toHaveLength(1);

    // Stand within its range, under it: it breathes fireballs.
    const px: number = Math.max(
      20,
      Math.min(1240, dragon.x + dragon.width / 2 - DRAGON_ATTACK_RANGE / 2),
    );
    await player.probe.teleport(px, GROUND_Y - 48);
    await player.probe.waitFor(
      'a dragon fireball in flight',
      (s: E2eSnapshot): boolean => s.zombieProjectiles.dragon > 0,
      { timeoutMs: 15_000 },
    );
    await player.attachCanvas(testInfo, 'dragon breathing fire');
  });
});
