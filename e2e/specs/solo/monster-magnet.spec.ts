import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const MAGNET_ID: string = 'warrior-monster-magnet';

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
    await p.probe.setGodMode(true);
    const magnet: E2eSkillView | undefined = (await p.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.id === MAGNET_ID,
    );
    expect(magnet, 'monster magnet is usable').toBeDefined();

    // A zombie standing well away from the player, on the same ground.
    const ready: E2eSnapshot = await p.probe.waitFor(
      'a zombie on the ground far from the player',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => {
          const gap: number | null = gapOf(s, z.id);
          return (
            !z.isDead &&
            z.spawnTimer <= 0 &&
            Math.abs(z.y + z.height - WORLD.groundY) < 4 &&
            gap !== null &&
            gap > 220 &&
            gap < 600
          );
        }),
      { timeoutMs: 40_000 },
    );
    const target: E2eZombieView = ready.zombies.find((z: E2eZombieView): boolean => {
      const gap: number | null = gapOf(ready, z.id);
      return !z.isDead && z.spawnTimer <= 0 && gap !== null && gap > 220 && gap < 600;
    })!;

    await p.castSkill(magnet!.slot);
    const samples: Array<{ ms: number; gap: number; pull: number | null }> = [];
    const started: number = Date.now();
    while (Date.now() - started < 2_000) {
      const s: E2eSnapshot = await p.probe.state();
      const gap: number | null = gapOf(s, target.id);
      if (gap === null) break;
      const view: E2eZombieView | undefined = s.zombies.find(
        (z: E2eZombieView): boolean => z.id === target.id,
      );
      samples.push({ ms: Date.now() - started, gap, pull: view?.magnetPull ?? null });
      await p.wait(30);
    }
    await testInfo.attach('pull samples', {
      body: JSON.stringify(samples),
      contentType: 'application/json',
    });

    const pulled: Array<{ ms: number; gap: number; pull: number | null }> = samples.filter(
      (x: { pull: number | null }): boolean => x.pull !== null,
    );
    expect(pulled.length, 'the zombie was under the magnet for several frames').toBeGreaterThan(3);
    expect(
      samples[0].gap,
      'no teleport: right after the cast it is still far away',
    ).toBeGreaterThan(150);
    const inFlight: number = pulled.filter(
      (x: { gap: number }): boolean => x.gap > 60 && x.gap < samples[0].gap - 20,
    ).length;
    expect(inFlight, 'seen part-way along the drag, not just before and after').toBeGreaterThan(0);
    const last: { gap: number; pull: number | null } = samples[samples.length - 1];
    expect(last.pull, 'the drag ends').toBeNull();
    expect(last.gap, 'it lands next to the warrior').toBeLessThan(90);
  });
});
