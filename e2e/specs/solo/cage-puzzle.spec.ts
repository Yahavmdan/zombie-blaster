import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { Brain } from '../../support/brain';
import { E2eCageView, E2eDropView, E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const CAGE_FLOOR: number = 4;

async function cageFloor(p: GamePlayer): Promise<E2eSnapshot> {
  await p.probe.setGodMode(true);
  await p.probe.setFloor(CAGE_FLOOR);
  return p.probe.waitFor(
    'the cage floor',
    (st: E2eSnapshot): boolean => st.floor === CAGE_FLOOR && st.cages !== null,
  );
}

/** Puts the player on the surface left of cage i's cleat, facing it, and swings until its chain snaps. */
async function cutChain(p: GamePlayer, cages: E2eCageView[], i: number): Promise<void> {
  const cleat: E2eCageView['cleat'] = cages[i].cleat;
  // Face first: the turning key-press walks a step.
  await p.face('right');
  await p.probe.teleport(cleat.x - WORLD.playerWidth - 4, cleat.y + cleat.height - WORLD.playerHeight);
  await p.wait(300);
  await p.hold(KEYS.attack);
  await p.probe.waitFor('the chain snaps', (st: E2eSnapshot): boolean => st.cages!.cages[i].cut, {
    timeoutMs: 8_000,
  });
  await p.release(KEYS.attack);
  const before: E2eCageView[] = cages;
  const others: boolean = (await p.probe.state()).cages!.cages.some(
    (c: E2eCageView, j: number): boolean => j !== i && c.cleatHits > before[j].cleatHits,
  );
  expect(others, 'a swing hits only the cleat faced').toBe(false);
}

/** Cuts cage i's chain and waits for it to land. */
async function dropCage(p: GamePlayer, cages: E2eCageView[], i: number): Promise<E2eSnapshot> {
  await cutChain(p, cages, i);
  return p.probe.waitFor('the cage lands', (st: E2eSnapshot): boolean => st.cages!.cages[i].landed, {
    timeoutMs: 5_000,
  });
}

function centerX(box: { x: number; width: number }): number {
  return box.x + box.width / 2;
}

test.describe('hanging cages (floor 4)', { tag: '@solo' }, (): void => {
  test('floor 4: 4-5 covered cages, one under the exit, the rest mid-screen; one cleat each, never on the safe spot', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await cageFloor(p);
    const cages: E2eCageView[] = s0.cages!.cages;
    await p.attachCanvas(testInfo, 'cages hanging');
    expect(cages.length).toBeGreaterThanOrEqual(4);
    expect(cages.length).toBeLessThanOrEqual(5);
    const exitCage: E2eCageView = cages[0];
    expect(exitCage.exit).toBe(true);
    expect(centerX(exitCage.box!), 'centered under the exit').toBe(centerX(s0.exit));
    expect(exitCage.box!.y).toBeGreaterThan(s0.exit.y);
    const safe: { x: number; y: number; width: number } = s0.level.safeSpot!;
    for (const cage of cages) {
      expect(cage.solid, 'every cage hangs solid').toEqual(cage.box);
      const onSafeSpot: boolean =
        cage.cleat.y + cage.cleat.height === safe.y &&
        cage.cleat.x > safe.x &&
        cage.cleat.x < safe.x + safe.width;
      expect(onSafeSpot, 'no cleat on the safe spot (no swinging there)').toBe(false);
    }
    const contents: string[] = cages.map((c: E2eCageView): string => c.content);
    expect(contents.filter((c: string): boolean => c === 'zombies').length).toBe(2);
    expect(contents.filter((c: string): boolean => c === 'loot').length).toBe(1);
    expect(s0.exitPile.reachable).toBe(false);

    // Standing on a hanging mid-screen cage: it is as solid as it looks.
    const mid: { x: number; y: number; width: number; height: number } = cages[1].box!;
    await p.probe.teleport(centerX(mid) - WORLD.playerWidth / 2, mid.y - WORLD.playerHeight - 40);
    // Let the drop play out (a teleport can report grounded for a tick before falling).
    await p.wait(500);
    const landed: E2eSnapshot = await p.probe.waitFor(
      'landed on the cage',
      (st: E2eSnapshot): boolean => st.player!.isGrounded && st.player!.velocityY === 0,
      { timeoutMs: 3_000 },
    );
    expect(landed.player!.y + WORLD.playerHeight, 'feet on its top bar').toBe(mid.y);
  });

  test('cut the exit cage chain: it lands under the exit as a step; pile the dead on it and climb out', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await cageFloor(p);
    await p.probe.clearVfxLog();
    const down: E2eSnapshot = await dropCage(p, s0.cages!.cages, 0);
    const cage: E2eCageView = down.cages!.cages[0];
    expect(cage.box!.y + cage.box!.height, 'on the ground').toBe(WORLD.groundY);
    expect(cage.solid, 'a solid step').toEqual(cage.box);
    expect(
      down.cages!.cages.slice(1).every((c: E2eCageView): boolean => !c.cut),
      'the others still hang',
    ).toBe(true);
    expect(down.exitPile.baseY, 'the pile now starts on the cage').toBe(cage.box!.y);
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'cage-land')).toBe(true);
    await p.attachCanvas(testInfo, `exit cage landed (it hid: ${cage.content})`);

    let ready: E2eSnapshot = down;
    for (let batch: number = 0; batch < 10 && !ready.exitPile.reachable; batch++) {
      await p.probe.dropCorpses(ready.exitPile.centerX, 10);
      await p.wait(2_500);
      ready = await p.probe.state();
    }
    expect(ready.exitPile.reachable, 'the pile on the cage reached jump range').toBe(true);
    expect(ready.exitPile.bodies, 'the cage saves the bottom of the pile').toBeLessThan(
      Math.ceil((WORLD.groundY - ready.exitPile.reachY) / 5),
    );
    await p.attachCanvas(testInfo, 'pile on the cage');
    // Setup: start beside the cage (crossing the map through the crowd is not what this tests).
    const side: number = ready.exitPile.centerX < WORLD.width / 2 ? 1 : -1;
    await p.probe.teleport(
      ready.exitPile.centerX + side * 110 - WORLD.playerWidth / 2,
      WORLD.groundY - WORLD.playerHeight,
    );
    const logs: string[] = [];
    const brain: Brain = new Brain(p, {
      deadline: Date.now() + 60_000,
      goal: 'exit',
      log: (m: string): void => {
        logs.push(m);
      },
      stopWhen: (st: E2eSnapshot): boolean => st.floor > CAGE_FLOOR,
    });
    await brain.run();
    await testInfo.attach('brain log', { body: logs.join('\n'), contentType: 'text/plain' });
    expect((await p.probe.state()).floor, 'climbed the cage and the pile onto the exit').toBe(
      CAGE_FLOOR + 1,
    );
  });

  test('cut the other chains: each cage smashes where it lands and spills what it hid', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await cageFloor(p);
    // One mid-screen cage of each content there is (two cages hide zombies: one is always mid-screen).
    const picks: number[] = ['zombies', 'loot', 'empty']
      .map((content: string): number =>
        s0.cages!.cages.findIndex((c: E2eCageView, i: number): boolean => i > 0 && c.content === content),
      )
      .filter((i: number): boolean => i > 0);
    expect(s0.cages!.cages[picks[0]].content).toBe('zombies');
    for (const i of picks) {
      const before: E2eSnapshot = await p.probe.state();
      const cage: E2eCageView = before.cages!.cages[i];
      const cx: number = centerX(cage.box!);
      const oldDrops: Set<string> = new Set<string>(before.drops.map((d: E2eDropView): string => d.id));
      await p.probe.clearVfxLog();
      const smashed: E2eSnapshot = await dropCage(p, before.cages!.cages, i);
      expect(smashed.cages!.cages[i].box, 'the cage is gone').toBeNull();
      expect(smashed.cages!.cages[i].solid).toBeNull();
      expect(smashed.cages!.cages[0].cut, 'the exit cage still hangs').toBe(false);
      const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
      expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'cage-smash')).toBe(true);
      const near: (x: number) => boolean = (x: number): boolean => Math.abs(x - cx) < 140;
      const newDrops: E2eDropView[] = smashed.drops.filter(
        (d: E2eDropView): boolean => !oldDrops.has(d.id) && near(d.x),
      );
      if (cage.content === 'zombies') {
        const loose: E2eZombieView[] = smashed.zombies.filter(
          (z: E2eZombieView): boolean =>
            near(z.x + z.width / 2) && Math.abs(z.y + z.height - cage.landY) < 8,
        );
        expect(loose.length, 'its zombies spill out where it landed').toBeGreaterThanOrEqual(
          s0.cages!.zombiesPerCage,
        );
      } else if (cage.content === 'loot') {
        expect(
          newDrops.map((d: E2eDropView): string => d.type).sort(),
          'gold and potions pop out',
        ).toEqual(['gold', 'hp-potion', 'mp-potion']);
      } else {
        expect(newDrops, 'an empty cage gives nothing').toEqual([]);
      }
      await p.attachCanvas(testInfo, `${cage.content} cage smashed`);
    }
  });
});
