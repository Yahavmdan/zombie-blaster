import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

/** The probe's foothold top sits this far above the corpse's feet (ZOMBIE_CORPSE_PLATFORM_HEIGHT). */
const FOOTHOLD_DEPTH: number = 5;

function corpseFeet(c: E2eCorpseView): number {
  return c.footY + FOOTHOLD_DEPTH;
}

function corpseCenterX(c: E2eCorpseView): number {
  return c.footX + c.footWidth / 2;
}

function findCorpse(s: E2eSnapshot, id: string): E2eCorpseView | undefined {
  return s.corpseViews.find((c: E2eCorpseView): boolean => c.id === id);
}

/** Drops one corpse near the screen center and waits for it to land; returns it. */
async function lyingCorpse(p: GamePlayer, x: number): Promise<E2eCorpseView> {
  const before: E2eSnapshot = await p.probe.state();
  const known: Set<string> = new Set<string>(
    before.corpseViews.map((c: E2eCorpseView): string => c.id),
  );
  await p.probe.dropCorpses(x, 1);
  const landed: E2eSnapshot = await p.probe.waitFor(
    'the dropped corpse lands',
    (s: E2eSnapshot): boolean =>
      s.corpseViews.some((c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded),
  );
  return landed.corpseViews.find((c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded)!;
}

/**
 * Ground walking speed while holding right: the most common of several samples. Walking sets
 * the same speed every tick, so a zombie bump (knockback) or a stall only adds odd samples out.
 */
async function walkSpeed(p: GamePlayer): Promise<number> {
  await p.hold(KEYS.right);
  const counts: Map<number, number> = new Map<number, number>();
  for (let i: number = 0; i < 8; i++) {
    await p.wait(50);
    const s: E2eSnapshot = await p.probe.state();
    if (!s.player!.isGrounded) continue;
    const speed: number = Math.round(Math.abs(s.player!.velocityX) * 100) / 100;
    counts.set(speed, (counts.get(speed) ?? 0) + 1);
  }
  await p.release(KEYS.right);
  let best: number = 0;
  let bestCount: number = 0;
  for (const [speed, count] of counts) {
    if (count > bestCount) {
      best = speed;
      bestCount = count;
    }
  }
  return best;
}

test.describe('carrying corpses', { tag: '@solo' }, (): void => {
  test('E picks up the nearest corpse, it rides overhead, slows you and blocks attacks; E again tosses it forward', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);

    const corpse: E2eCorpseView = await lyingCorpse(p, 500);
    const feet: number = corpseFeet(corpse);
    await p.face('right');
    await p.probe.teleport(
      corpseCenterX(corpse) - WORLD.playerWidth / 2,
      feet - WORLD.playerHeight,
    );
    await p.wait(300);
    const baseSpeed: number = await walkSpeed(p);
    await p.wait(300);

    // Back at the corpse (the speed check walked a few steps).
    await p.probe.teleport(
      corpseCenterX(corpse) - WORLD.playerWidth / 2,
      feet - WORLD.playerHeight,
    );
    await p.wait(300);
    await p.press(KEYS.carry, 70);
    const carrying: E2eSnapshot = await p.probe.waitFor(
      'the corpse is picked up',
      (s: E2eSnapshot): boolean =>
        s.player!.carryingCorpseId === corpse.id &&
        findCorpse(s, corpse.id)?.carrierId === s.player!.id,
    );
    const held: E2eCorpseView = findCorpse(carrying, corpse.id)!;
    expect(held.isGrounded, 'out of the world while carried').toBe(false);
    expect(
      Math.abs(corpseCenterX(held) - (carrying.player!.x + WORLD.playerWidth / 2)),
    ).toBeLessThan(2);
    expect(corpseFeet(held), "on the carrier's head").toBeLessThan(carrying.player!.y + 20);
    await p.attachCanvas(testInfo, 'carrying a corpse');

    const carrySpeed: number = await walkSpeed(p);
    expect(carrySpeed / baseSpeed, 'slower with a body overhead').toBeCloseTo(0.75, 1);

    const walked: E2eSnapshot = await p.probe.state();
    const follow: E2eCorpseView = findCorpse(walked, corpse.id)!;
    expect(follow.carrierId).toBe(walked.player!.id);
    expect(
      Math.abs(corpseCenterX(follow) - (walked.player!.x + WORLD.playerWidth / 2)),
      'the corpse moved with the carrier',
    ).toBeLessThan(2);

    await p.hold(KEYS.attack);
    let attacked: boolean = false;
    for (let i: number = 0; i < 6; i++) {
      await p.wait(50);
      if ((await p.probe.state()).player!.isAttacking) attacked = true;
    }
    await p.release(KEYS.attack);
    expect(attacked, 'hands full: no attacks').toBe(false);

    await p.wait(200);
    const beforeToss: E2eSnapshot = await p.probe.state();
    await p.press(KEYS.carry, 70);
    const tossed: E2eSnapshot = await p.probe.waitFor(
      'the tossed corpse lands',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        return s.player!.carryingCorpseId === null && !!c && c.carrierId === null && c.isGrounded;
      },
    );
    const landed: E2eCorpseView = findCorpse(tossed, corpse.id)!;
    expect(corpseCenterX(landed), 'thrown forward, the way the carrier faces').toBeGreaterThan(
      beforeToss.player!.x + WORLD.playerWidth / 2 + 10,
    );
    await p.attachCanvas(testInfo, 'tossed corpse');

    // Free hands again: attacking works.
    await p.hold(KEYS.attack);
    await p.probe.waitFor('attacks again', (s: E2eSnapshot): boolean => s.player!.isAttacking, {
      timeoutMs: 3_000,
    });
    await p.release(KEYS.attack);
  });
});
