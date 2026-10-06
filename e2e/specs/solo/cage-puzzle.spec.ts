import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { Brain } from '../../support/brain';
import { E2eCageView, E2eSnapshot, E2eVfxLogEntry, E2eZombieView } from '../../support/probe';
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

/** Puts the player up on the ledge left of a cleat, facing it, and swings until its chain snaps. */
async function cutChain(p: GamePlayer, cage: E2eCageView): Promise<void> {
  // Face first: the turning key-press walks a step.
  await p.face('right');
  await p.probe.teleport(
    cage.cleat.x - WORLD.playerWidth - 4,
    cage.cleat.y + cage.cleat.height - WORLD.playerHeight,
  );
  await p.wait(300);
  await p.hold(KEYS.attack);
  await p.probe.waitFor(
    'the chain snaps',
    (st: E2eSnapshot): boolean =>
      st.cages!.exitCage.cleat.x === cage.cleat.x
        ? st.cages!.exitCage.cut
        : st.cages!.zombieCage.cut,
    { timeoutMs: 8_000 },
  );
  await p.release(KEYS.attack);
}

test.describe('hanging cages (floor 4)', { tag: '@solo' }, (): void => {
  test('floor 4: an empty cage hangs under the exit, a zombie cage mid-screen, their chains tied to cleats on a ledge', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await cageFloor(p);
    const exitCage: E2eCageView = s0.cages!.exitCage;
    const zombieCage: E2eCageView = s0.cages!.zombieCage;
    await p.attachCanvas(testInfo, 'cages hanging');
    expect(exitCage.solid, 'the exit cage hangs solid').toEqual(exitCage.box);
    expect(exitCage.box!.x + exitCage.box!.width / 2, 'centered under the exit').toBe(
      s0.exit.x + s0.exit.width / 2,
    );
    expect(exitCage.box!.y).toBeGreaterThan(s0.exit.y);
    expect(zombieCage.solid).toEqual(zombieCage.box);
    expect(Math.abs(zombieCage.box!.x + zombieCage.box!.width / 2 - WORLD.width / 2)).toBeLessThan(
      250,
    );
    const both: E2eCageView[] = [exitCage, zombieCage];
    for (const cage of both) {
      const feet: number = cage.cleat.y + cage.cleat.height;
      const ledge: { x: number; y: number; width: number } | undefined = s0.level.platforms.find(
        (pl: { x: number; y: number; width: number }): boolean =>
          pl.y === feet && cage.cleat.x > pl.x && cage.cleat.x + cage.cleat.width < pl.x + pl.width,
      );
      expect(ledge, 'the cleat stands on a ledge').toBeDefined();
      expect(ledge!.y, 'not the safe spot (no swinging there)').not.toBe(s0.level.safeSpot!.y);
    }
    expect(s0.exitPile.reachable).toBe(false);

    // Standing on the hanging zombie cage: it is as solid as it looks.
    await p.probe.teleport(
      zombieCage.box!.x + zombieCage.box!.width / 2 - WORLD.playerWidth / 2,
      zombieCage.box!.y - WORLD.playerHeight - 40,
    );
    // Let the drop play out (a teleport can report grounded for a tick before falling).
    await p.wait(500);
    const landed: E2eSnapshot = await p.probe.waitFor(
      'landed on the zombie cage',
      (st: E2eSnapshot): boolean => st.player!.isGrounded && st.player!.velocityY === 0,
      { timeoutMs: 3_000 },
    );
    expect(landed.player!.y + WORLD.playerHeight, 'feet on its top bar').toBe(zombieCage.box!.y);
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
    await cutChain(p, s0.cages!.exitCage);
    const down: E2eSnapshot = await p.probe.waitFor(
      'the exit cage lands',
      (st: E2eSnapshot): boolean => st.cages!.exitCage.landed,
      { timeoutMs: 5_000 },
    );
    const cage: E2eCageView = down.cages!.exitCage;
    expect(cage.box!.y + cage.box!.height, 'on the ground').toBe(WORLD.groundY);
    expect(cage.solid, 'a solid step').toEqual(cage.box);
    expect(down.cages!.zombieCage.cut, 'the zombie cage still hangs').toBe(false);
    expect(down.exitPile.baseY, 'the pile now starts on the cage').toBe(cage.box!.y);
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'cage-land')).toBe(true);
    await p.attachCanvas(testInfo, 'exit cage landed');

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

  test('cut the wrong chain: the zombie cage smashes on the ground and lets its zombies loose', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    const s0: E2eSnapshot = await cageFloor(p);
    const cage: { x: number; y: number; width: number; height: number } = s0.cages!.zombieCage.box!;
    const cx: number = cage.x + cage.width / 2;
    await p.probe.clearVfxLog();
    await cutChain(p, s0.cages!.zombieCage);
    const smashed: E2eSnapshot = await p.probe.waitFor(
      'the zombie cage smashes',
      (st: E2eSnapshot): boolean => st.cages!.zombieCage.landed,
      { timeoutMs: 5_000 },
    );
    expect(smashed.cages!.zombieCage.box, 'the cage is gone').toBeNull();
    expect(smashed.cages!.zombieCage.solid).toBeNull();
    expect(smashed.cages!.exitCage.cut, 'the exit cage still hangs').toBe(false);
    const loose: E2eZombieView[] = smashed.zombies.filter(
      (z: E2eZombieView): boolean => Math.abs(z.x + z.width / 2 - cx) < 120,
    );
    expect(loose.length, 'its zombies spill out where it smashed').toBeGreaterThanOrEqual(
      smashed.cages!.zombiesReleased,
    );
    const log: E2eVfxLogEntry[] = await p.probe.vfxLog();
    expect(log.some((e: E2eVfxLogEntry): boolean => e.type === 'cage-smash')).toBe(true);
    await p.attachCanvas(testInfo, 'zombie cage smashed');
  });
});
