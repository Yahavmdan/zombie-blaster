import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { Brain } from '../../support/brain';
import { E2eCorpseView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { GROUND } from '../../support/navigation';
import { WORLD } from '../../support/invariants';

/**
 * Exit beacon: the exit's light column marks where zombies must die; each one slain inside
 * it joins a non-rotting corpse stack under the exit, and the stack is how players climb out.
 */
test.describe('exit beacon and corpse stack', { tag: '@solo' }, (): void => {
  test('the exit beam reaches the ground and starts with an empty stack', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const s: E2eSnapshot = await p.probe.state();
    expect(s.exitStack.baseY, 'the stack rises from the ground, where zombies are').toBe(GROUND.y);
    expect(s.exitStack.steps).toBe(0);
    expect(s.exitStack.progress).toBe(0);
    expect(s.exitStack.reachable).toBe(false);
    expect(s.exitStack.stepsNeeded).toBeGreaterThan(0);
    expect(s.exitStack.stepsNeeded, 'a handful of kills, not a tower').toBeLessThanOrEqual(20);
  });

  test('while the stack is unfinished, the dead rise on the ground beside the beam', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    const reach: number = s0.exitStack.columnRight - s0.exitStack.centerX + 300;
    const seen: Set<string> = new Set<string>();
    let nearBeam: number = 0;
    const end: number = Date.now() + 60_000;
    while (Date.now() < end && seen.size < 10) {
      const s: E2eSnapshot = await p.probe.state();
      for (const z of s.zombies.filter((zz: E2eZombieView): boolean => zz.spawnTimer > 0)) {
        if (seen.has(z.id)) continue;
        seen.add(z.id);
        const onGround: boolean = Math.abs(z.y + z.height - GROUND.y) <= 2;
        if (onGround && Math.abs(z.x + z.width / 2 - s.exitStack.centerX) <= reach) nearBeam++;
      }
      await p.wait(100);
    }
    expect(seen.size, `zombies spawned`).toBeGreaterThanOrEqual(6);
    // Half the spawns go beside the beam; with only ~10 samples, demand 2 (exact odds are unit-tested).
    expect(nearBeam, `${nearBeam}/${seen.size} rose near the beam`).toBeGreaterThanOrEqual(2);
  });

  test('slaying zombies in the beam builds a stack you climb to the next floor', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(420_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.maxOutPlayer();
    await p.probe.setGodMode(true);
    const logs: string[] = [];
    const brain: Brain = new Brain(p, {
      deadline: Date.now() + 360_000,
      goal: 'exit',
      log: (m: string): void => {
        logs.push(m);
      },
      stopWhen: (s: E2eSnapshot): boolean => s.floor > 1,
    });
    let atReady: E2eSnapshot | null = null;
    const watcher: Promise<void> = (async (): Promise<void> => {
      atReady = await p.probe.waitFor(
        'stack reaches the exit',
        (s: E2eSnapshot): boolean => s.exitStack.reachable || s.floor > 1,
        {
          timeoutMs: 360_000,
          intervalMs: 500,
        },
      );
      await p.attachCanvas(testInfo, 'stack ready');
    })();
    const timeline: string[] = [];
    const sampler: ReturnType<typeof setInterval> = setInterval((): void => {
      void p.probe
        .state()
        .then((st: E2eSnapshot): void => {
          timeline.push(
            `${Math.round((Date.now() - started) / 1000)}s steps=${st.exitStack.steps}/${st.exitStack.stepsNeeded} x=${Math.round(st.player!.x)} zombies=${st.zombies.length} corpses=${st.corpses}`,
          );
        })
        .catch((): void => undefined);
    }, 10_000);
    const started: number = Date.now();
    await brain.run();
    clearInterval(sampler);
    await testInfo.attach('stack timeline', {
      body: timeline.join('\n'),
      contentType: 'text/plain',
    });
    await watcher.catch((): void => undefined);
    await testInfo.attach('brain log', { body: logs.join('\n'), contentType: 'text/plain' });

    expect(atReady, 'the stack reached jump range of the exit').not.toBeNull();
    const ready: E2eSnapshot = atReady!;
    if (ready.floor === 1) {
      const stacked: E2eCorpseView[] = ready.corpseViews.filter(
        (c: E2eCorpseView): boolean => c.anchored,
      );
      expect(stacked.length).toBeGreaterThanOrEqual(ready.exitStack.stepsNeeded);
      for (const c of stacked) {
        expect(c.frozen && c.frame === c.lastFrame, 'stacked corpses lie flat').toBe(true);
        expect(
          c.x + 30 > ready.exitStack.columnLeft && c.x < ready.exitStack.columnRight,
          'stack stays in the beam',
        ).toBe(true);
      }
    }
    const final: E2eSnapshot = await p.probe.state();
    expect(final.floor, 'climbing the stack reaches floor 2').toBe(2);
    expect(final.exitStack.steps, 'new floor starts with a fresh stack').toBe(0);
  });

  test('a ranged class shooting from inside the beam builds the stack', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const p: GamePlayer = await solo('assassin');
    await p.probe.setGodMode(true);
    const brain: Brain = new Brain(p, {
      deadline: Date.now() + 120_000,
      goal: 'exit',
      stopWhen: (s: E2eSnapshot): boolean => s.exitStack.steps >= 3,
    });
    await brain.run();
    const s: E2eSnapshot = await p.probe.state();
    expect(s.exitStack.steps, 'kills made from the light count, even at range').toBeGreaterThanOrEqual(3);
  });

  test('the beam steadies climbers on and between steps, not on the ground', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    expect(s0.exitStack.playerSteadied, 'no stack yet').toBe(false);
    await p.probe.buildExitStack(3);
    const built: E2eSnapshot = await p.probe.waitFor(
      'three steps',
      (s: E2eSnapshot): boolean => s.exitStack.steps >= 3,
    );
    const x: number = built.exitStack.centerX - WORLD.playerWidth / 2;
    await p.probe.teleport(x, built.exitStack.topY - 70 - WORLD.playerHeight);
    expect(
      (await p.probe.state()).exitStack.playerSteadied,
      'steadied above the ground in the column',
    ).toBe(true);
    await p.probe.teleport(built.exitStack.columnLeft - 200, GROUND.y - WORLD.playerHeight);
    await p.wait(100);
    expect((await p.probe.state()).exitStack.playerSteadied, 'not on the ground outside').toBe(
      false,
    );
  });

  test('a finished stack is climbable: step by step up to the exit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await p.probe.state();
    await p.probe.buildExitStack(s0.exitStack.stepsNeeded);
    const ready: E2eSnapshot = await p.probe.waitFor(
      'stack ready',
      (s: E2eSnapshot): boolean => s.exitStack.reachable,
    );
    await p.attachCanvas(testInfo, 'stack built');
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
    expect(ready.exitStack.topY).toBeLessThanOrEqual(ready.exitStack.reachY);
    expect((await p.probe.state()).floor, 'climbed the stack onto the exit').toBe(2);
  });
});
