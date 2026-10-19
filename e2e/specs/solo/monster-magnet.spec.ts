import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { WARRIOR, castSkill, warriorArena, zombieAt } from '../../support/warrior';

/** Horizontal gap between a zombie and the player, center to center. */
function gapOf(s: E2eSnapshot, zombieId: string): number | null {
  const z: E2eZombieView | undefined = s.zombies.find(
    (zz: E2eZombieView): boolean => zz.id === zombieId && !zz.isDead,
  );
  if (!z || !s.player) return null;
  return Math.abs(z.x + z.width / 2 - (s.player.x + WORLD.playerWidth / 2));
}

/**
 * Monster magnet drags zombies in over time instead of teleporting them: a far zombie braces
 * for a moment, is torn loose and pulled in, closing the gap step by step.
 */
test.describe('monster magnet', { tag: '@solo' }, (): void => {
  test('pulled zombies are dragged in over time, not teleported', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.maxOutPlayer();
    const x: number = await warriorArena(p, [WARRIOR.monsterMagnet]);

    // A zombie standing well away from the player, on the same ground.
    const target: string = await zombieAt(p, x + 320);
    expect(gapOf(await p.probe.state(), target), 'the zombie starts far away').toBeGreaterThan(200);

    // The magnet's skill-bar key.
    await castSkill(p, WARRIOR.monsterMagnet);
    const samples: Array<{ ms: number; gap: number; pull: number | null }> = [];
    const started: number = Date.now();
    while (Date.now() - started < 2_000) {
      const s: E2eSnapshot = await p.probe.state();
      const gap: number | null = gapOf(s, target);
      if (gap === null) break;
      const view: E2eZombieView | undefined = s.zombies.find(
        (z: E2eZombieView): boolean => z.id === target,
      );
      samples.push({ ms: Date.now() - started, gap, pull: view?.magnetPull ?? null });
      await p.wait(30);
    }
    await testInfo.attach('pull samples', {
      body: JSON.stringify(samples),
      contentType: 'application/json',
    });

    const pulled: Array<{ ms: number; gap: number; pull: number | null }> = samples.filter(
      (s: { pull: number | null }): boolean => s.pull !== null,
    );
    expect(pulled.length, 'the zombie was under the magnet for several frames').toBeGreaterThan(3);
    expect(
      samples[0].gap,
      'no teleport: right after the cast it is still far away',
    ).toBeGreaterThan(150);
    const inFlight: number = pulled.filter(
      (s: { gap: number }): boolean => s.gap > 60 && s.gap < samples[0].gap - 20,
    ).length;
    expect(inFlight, 'seen part-way along the drag, not just before and after').toBeGreaterThan(0);
    const last: { gap: number; pull: number | null } = samples[samples.length - 1];
    expect(last.pull, 'the drag ends').toBeNull();
    expect(last.gap, 'it lands next to the warrior').toBeLessThan(90);
  });
});
