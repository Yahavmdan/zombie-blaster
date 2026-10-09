import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';

/**
 * Crowd fairness: every melee swing is telegraphed, a crowd can't all swing at once, and the
 * first floors hit gently while players learn.
 */

async function sample(
  p: GamePlayer,
  durationMs: number,
  onState: (s: E2eSnapshot, at: number) => void,
): Promise<void> {
  const end: number = Date.now() + durationMs;
  while (Date.now() < end) {
    onState(await p.probe.state(), Date.now());
    await p.wait(30);
  }
}

/** Spitters and dragons attack from range and do not take melee attack tokens. */
const RANGED_TYPES: string[] = ['spitter', 'dragon-boss'];

function nearPlayer(s: E2eSnapshot, z: E2eZombieView, radius: number): boolean {
  const p: NonNullable<E2eSnapshot['player']> = s.player!;
  return Math.hypot(z.x + z.width / 2 - (p.x + 16), z.y + z.height / 2 - (p.y + 24)) < radius;
}

test.describe('crowd fairness', { tag: '@solo' }, (): void => {
  test('zombies telegraph a melee swing for about half a second before it lands', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const windupStart: Map<string, number> = new Map<string, number>();
    const windups: number[] = [];
    await sample(p, 30_000, (s: E2eSnapshot, at: number): void => {
      for (const z of s.zombies) {
        if (z.windingUp && !windupStart.has(z.id)) windupStart.set(z.id, at);
        if (!z.windingUp && windupStart.has(z.id)) {
          windups.push(at - windupStart.get(z.id)!);
          windupStart.delete(z.id);
        }
      }
    });
    await testInfo.attach('wind-up durations (ms)', {
      body: windups.join(', '),
      contentType: 'text/plain',
    });
    expect(windups.length, 'saw zombies wind up').toBeGreaterThan(0);
    const typical: number = [...windups].sort((a: number, b: number): number => a - b)[
      Math.floor(windups.length / 2)
    ];
    // Wind-up (15 ticks = 300 ms) then the swing's own 200 ms lead-in before the hit.
    expect(typical, 'median visible wind-up').toBeGreaterThanOrEqual(240);

    await p.probe.waitFor(
      'a zombie winding up',
      (s: E2eSnapshot): boolean => s.zombies.some((z: E2eZombieView): boolean => z.windingUp),
      { timeoutMs: 15_000, intervalMs: 20 },
    );
    await p.attachCanvas(testInfo, 'wind-up telegraph: "!" over the head');
  });

  test('at most two zombies swing at the same player at once', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await p.probe.setFloor(8);
    let maxSwinging: number = 0;
    let maxAround: number = 0;
    await sample(p, 25_000, (s: E2eSnapshot): void => {
      const around: E2eZombieView[] = s.zombies.filter(
        (z: E2eZombieView): boolean =>
          !z.isDead && z.spawnTimer <= 0 && !RANGED_TYPES.includes(z.type) && nearPlayer(s, z, 150),
      );
      maxAround = Math.max(maxAround, around.length);
      maxSwinging = Math.max(
        maxSwinging,
        around.filter((z: E2eZombieView): boolean => z.isAttacking).length,
      );
    });
    await testInfo.attach('crowd', {
      body: JSON.stringify({ maxAround, maxSwinging }),
      contentType: 'application/json',
    });
    expect(maxAround, 'a crowd formed around the player').toBeGreaterThanOrEqual(3);
    expect(maxSwinging, 'attack tokens cap simultaneous swings').toBeLessThanOrEqual(2);
  });

  test('floor 1 zombies hit lightly', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    const hits: number[] = [];
    let lastHp: number = (await p.probe.state()).player!.hp;
    await sample(p, 40_000, (s: E2eSnapshot): void => {
      const hp: number = s.player!.hp;
      if (hp < lastHp) hits.push(lastHp - hp);
      lastHp = hp;
    });
    await testInfo.attach('hits taken', { body: hits.join(', '), contentType: 'text/plain' });
    expect(hits.length, 'got hit at least once').toBeGreaterThan(0);
    expect(Math.max(...hits), 'largest single hit on floor 1').toBeLessThanOrEqual(40);
  });
});
