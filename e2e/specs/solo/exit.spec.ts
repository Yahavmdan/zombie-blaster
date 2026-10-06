import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { Brain } from '../../support/brain';
import { E2eCorpseView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { GROUND, LevelPlatform, levelPlatforms } from '../../support/navigation';
import { WORLD } from '../../support/invariants';

/** Mirrors ZOMBIE_CORPSE_PLATFORM_HEIGHT in shared/game-constants.ts: one body is a thin layer. */
const CORPSE_STEP_PX: number = 5;

/**
 * The exit hangs out of reach. The only way up is the pile of the dead under it, and that pile is
 * ordinary: corpses there fall, stack and look exactly like corpses anywhere else on the map.
 */
test.describe('exit and the pile of the dead', { tag: '@solo' }, (): void => {
  test('the pile under the exit starts empty and the exit is out of reach', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const s: E2eSnapshot = await p.probe.state();
    expect(s.exitPile.baseY, 'the pile rises from the ground').toBe(GROUND.y);
    expect(s.exitPile.bodies).toBe(0);
    expect(s.exitPile.topY).toBe(GROUND.y);
    expect(s.exitPile.reachable).toBe(false);
    expect(s.exitPile.reachY).toBeLessThan(GROUND.y);
  });

  test('zombies slain under the exit pile up like anywhere else: thin bodies, nothing arranges them', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(180_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.maxOutPlayer();
    await p.probe.setGodMode(true);
    const brain: Brain = new Brain(p, {
      deadline: Date.now() + 150_000,
      goal: 'exit',
      stopWhen: (s: E2eSnapshot): boolean => s.exitPile.bodies >= 4,
    });
    await brain.run();
    const s: E2eSnapshot = await p.probe.state();
    await p.attachCanvas(testInfo, 'pile under the exit');
    expect(s.exitPile.bodies, 'kills under the exit leave bodies there').toBeGreaterThanOrEqual(4);
    // The pile may spill past the exit's edges: count every body lying near it.
    const nearby: number = s.corpseViews.filter(
      (c: E2eCorpseView): boolean =>
        c.isGrounded &&
        c.footX + c.footWidth > s.exitPile.columnLeft - 150 &&
        c.footX < s.exitPile.columnRight + 150,
    ).length;
    expect(
      s.exitPile.baseY - s.exitPile.topY,
      `each body adds a thin ${CORPSE_STEP_PX} px layer at most (no tall steps)`,
    ).toBeLessThanOrEqual(nearby * CORPSE_STEP_PX + 1);
    const elsewhere: E2eCorpseView[] = s.corpseViews.filter(
      (c: E2eCorpseView): boolean => c.footX >= s.exitPile.columnRight || c.footX + c.footWidth <= s.exitPile.columnLeft,
    );
    const inPile: E2eCorpseView[] = s.corpseViews.filter(
      (c: E2eCorpseView): boolean => !elsewhere.includes(c),
    );
    const widest: (cs: E2eCorpseView[]) => number = (cs: E2eCorpseView[]): number =>
      Math.max(0, ...cs.map((c: E2eCorpseView): number => c.footWidth));
    expect(widest(inPile), 'footholds under the exit are as narrow as anywhere').toBeLessThanOrEqual(
      Math.max(widest(elsewhere), 40),
    );
  });

  test('nothing calls the dead to the exit: zombies rise all over the map', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    const seen: Set<string> = new Set<string>();
    let nearExit: number = 0;
    const end: number = Date.now() + 70_000;
    while (Date.now() < end && seen.size < 12) {
      const s: E2eSnapshot = await p.probe.state();
      for (const z of s.zombies.filter((zz: E2eZombieView): boolean => zz.spawnTimer > 0)) {
        if (seen.has(z.id)) continue;
        seen.add(z.id);
        if (Math.abs(z.x + z.width / 2 - s0.exitPile.centerX) <= 400) nearExit++;
      }
      await p.wait(100);
    }
    expect(seen.size, 'zombies spawned').toBeGreaterThanOrEqual(8);
    // Uniform spawns put roughly a third within 400 px of an exit at the screen edge.
    expect(nearExit / seen.size, `${nearExit}/${seen.size} rose near the exit`).toBeLessThan(0.75);
  });

  test('a pile tall enough is climbable: walk into it, ride it up, jump to the exit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    let ready: E2eSnapshot = s0;
    for (let batch: number = 0; batch < 15 && !ready.exitPile.reachable; batch++) {
      await p.probe.dropCorpses(s0.exitPile.centerX, 10);
      await p.wait(2_500);
      ready = await p.probe.state();
    }
    await p.attachCanvas(testInfo, 'pile built');
    expect(ready.exitPile.reachable, 'the pile reached jump range of the exit').toBe(true);
    expect(
      ready.exitPile.bodies,
      'thin bodies: it takes dozens of them',
    ).toBeGreaterThanOrEqual(Math.floor((ready.exitPile.baseY - ready.exitPile.reachY) / CORPSE_STEP_PX));
    // Setup: start beside the pile (crossing the map through the crowd is not what this tests).
    const side: number = ready.exitPile.centerX < WORLD.width / 2 ? 1 : -1;
    await p.probe.teleport(
      ready.exitPile.centerX + side * 90 - WORLD.playerWidth / 2,
      GROUND.y - WORLD.playerHeight,
    );
    const logs: string[] = [];
    const brain: Brain = new Brain(p, {
      deadline: Date.now() + 60_000,
      goal: 'exit',
      log: (m: string): void => {
        logs.push(m);
      },
      stopWhen: (s: E2eSnapshot): boolean => s.floor > 1,
    });
    await brain.run();
    await testInfo.attach('brain log', { body: logs.join('\n'), contentType: 'text/plain' });
    const final: E2eSnapshot = await p.probe.state();
    expect(final.floor, 'climbed the pile onto the exit').toBe(2);
    expect(final.exitPile.bodies, 'the new floor starts without a pile').toBe(0);
  });

  test('the exit hangs out of reach on every generated floor: no double jump gets there', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(240_000);
    const p: GamePlayer = await solo('assassin');
    await p.probe.setGodMode(true);
    for (const floor of [1, 2, 3, 4]) {
      if (floor > 1) await p.probe.setFloor(floor);
      const s0: E2eSnapshot = await p.probe.waitFor(
        `floor ${floor}`,
        (s: E2eSnapshot): boolean => s.floor === floor,
      );
      const exitCx: number = s0.exit.x + s0.exit.width / 2;
      const towardExit: string = exitCx > WORLD.width / 2 ? KEYS.right : KEYS.left;
      // The nearest launch spots: the ground right under the exit and each platform's edge
      // nearest it (the safe spot included).
      const launches: Array<{ name: string; x: number; y: number }> = [
        { name: 'ground under the exit', x: exitCx - WORLD.playerWidth / 2, y: GROUND.y },
        ...levelPlatforms(s0)
          .filter((pl: LevelPlatform): boolean => pl.name !== GROUND.name)
          .map((pl: LevelPlatform): { name: string; x: number; y: number } => {
            const nearEdge: number =
              Math.abs(pl.x - exitCx) < Math.abs(pl.x + pl.width - exitCx)
                ? pl.x + 4
                : pl.x + pl.width - WORLD.playerWidth - 4;
            return { name: `platform ${pl.name}`, x: nearEdge, y: pl.y };
          }),
      ];
      for (const launch of launches) {
        await p.probe.teleport(launch.x, launch.y - WORLD.playerHeight);
        await p.probe.waitFor(
          `floor ${floor}: standing on ${launch.name}`,
          (s: E2eSnapshot): boolean => s.player!.isGrounded,
        );
        let best: number = Infinity;
        await p.hold(towardExit);
        await p.hold(KEYS.jump);
        const end: number = Date.now() + 1_600;
        let doubled: boolean = false;
        while (Date.now() < end) {
          const s: E2eSnapshot = await p.probe.state();
          const overExit: boolean =
            s.player!.x + WORLD.playerWidth > s.exit.x && s.player!.x < s.exit.x + s.exit.width;
          if (overExit) best = Math.min(best, s.player!.y + WORLD.playerHeight);
          if (!doubled && s.player!.velocityY >= 0 && !s.player!.isGrounded) {
            await p.release(KEYS.jump);
            await p.press(KEYS.jump, 200);
            doubled = true;
          }
          await p.wait(20);
        }
        await p.releaseAll();
        const s: E2eSnapshot = await p.probe.state();
        expect(s.floor, `floor ${floor}: no shortcut to the exit from ${launch.name}`).toBe(floor);
        expect(
          best,
          `floor ${floor}, ${launch.name}: over the exit, the feet never rise to its top`,
        ).toBeGreaterThan(s.exit.y);
      }
    }
  });
});
