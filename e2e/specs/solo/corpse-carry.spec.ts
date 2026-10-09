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

type CarryPose = NonNullable<E2eCorpseView['carryPose']>;

/** Corpses one player can carry at once (CORPSE_CARRY_MAX). */
const MAX_CARRY: number = 3;

/** Drops n corpses at x and waits for all of them to land; returns them. */
async function lyingCorpses(p: GamePlayer, x: number, n: number): Promise<E2eCorpseView[]> {
  const before: E2eSnapshot = await p.probe.state();
  const known: Set<string> = new Set<string>(
    before.corpseViews.map((c: E2eCorpseView): string => c.id),
  );
  const fresh: (s: E2eSnapshot) => E2eCorpseView[] = (s: E2eSnapshot): E2eCorpseView[] =>
    s.corpseViews.filter((c: E2eCorpseView): boolean => !known.has(c.id) && c.isGrounded);
  await p.probe.dropCorpses(x, n);
  const landed: E2eSnapshot = await p.probe.waitFor(
    `the ${n} dropped corpses land`,
    (s: E2eSnapshot): boolean => fresh(s).length === n,
  );
  return fresh(landed);
}

/** Drops one corpse near the screen center and waits for it to land; returns it. */
async function lyingCorpse(p: GamePlayer, x: number): Promise<E2eCorpseView> {
  return (await lyingCorpses(p, x, 1))[0];
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
  test('E picks up the nearest corpse, it rides overhead and slows you; E again tosses it forward', async ({
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
        s.player!.carryingCorpseIds.includes(corpse.id) &&
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

    await p.wait(200);
    const beforeToss: E2eSnapshot = await p.probe.state();
    await p.press(KEYS.carry, 70);
    const tossed: E2eSnapshot = await p.probe.waitFor(
      'the tossed corpse lands',
      (s: E2eSnapshot): boolean => {
        const c: E2eCorpseView | undefined = findCorpse(s, corpse.id);
        return (
          s.player!.carryingCorpseIds.length === 0 && !!c && c.carrierId === null && c.isGrounded
        );
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

  test('carries up to 3 corpses stacked overhead; the toss lands them piled on top of each other', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const id: string = (await p.probe.state()).player!.id;

    const stack: E2eCorpseView[] = await lyingCorpses(p, 500, MAX_CARRY + 1);
    await p.face('right');
    for (let n: number = 1; n <= MAX_CARRY; n++) {
      const s: E2eSnapshot = await p.probe.state();
      const next: E2eCorpseView = s.corpseViews.find(
        (c: E2eCorpseView): boolean =>
          c.isGrounded &&
          c.carrierId === null &&
          stack.some((k: E2eCorpseView): boolean => k.id === c.id),
      )!;
      await p.probe.teleport(
        corpseCenterX(next) - WORLD.playerWidth / 2,
        corpseFeet(next) - WORLD.playerHeight,
      );
      await p.wait(300);
      await p.press(KEYS.carry, 70);
      await p.probe.waitFor(
        `carrying ${n}`,
        (st: E2eSnapshot): boolean =>
          st.player!.carryingCorpseIds.length === n &&
          st.corpseViews.filter((c: E2eCorpseView): boolean => c.carrierId === id).length === n,
      );
    }

    const full: E2eSnapshot = await p.probe.state();
    const carried: E2eCorpseView[] = full.player!.carryingCorpseIds.map(
      (cid: string): E2eCorpseView => findCorpse(full, cid)!,
    );
    for (let i: number = 1; i < carried.length; i++) {
      expect(carried[i].y, 'each pick-up rides on top of the last').toBeLessThan(carried[i - 1].y);
      expect(corpseCenterX(carried[i])).toBeCloseTo(corpseCenterX(carried[0]), 0);
    }
    await p.attachCanvas(testInfo, 'carrying three');

    // Full hands: E right on the fourth corpse throws instead of picking it up.
    const spare: E2eCorpseView = full.corpseViews.find(
      (c: E2eCorpseView): boolean =>
        c.carrierId === null && stack.some((k: E2eCorpseView): boolean => k.id === c.id),
    )!;
    await p.probe.teleport(
      corpseCenterX(spare) - WORLD.playerWidth / 2,
      corpseFeet(spare) - WORLD.playerHeight,
    );
    await p.wait(300);
    const thrower: E2eSnapshot = await p.probe.state();
    await p.press(KEYS.carry, 70);
    const ids: string[] = carried.map((c: E2eCorpseView): string => c.id);
    const landed: E2eSnapshot = await p.probe.waitFor(
      'the thrown stack lands',
      (s: E2eSnapshot): boolean =>
        s.player!.carryingCorpseIds.length === 0 &&
        ids.every((cid: string): boolean => {
          const c: E2eCorpseView | undefined = findCorpse(s, cid);
          return !!c && c.carrierId === null && c.isGrounded;
        }),
    );
    const pile: E2eCorpseView[] = ids
      .map((cid: string): E2eCorpseView => findCorpse(landed, cid)!)
      .sort((a: E2eCorpseView, b: E2eCorpseView): number => b.footY - a.footY);
    for (let i: number = 1; i < pile.length; i++) {
      expect(pile[i - 1].footY - pile[i].footY, 'each body rests on the one below it').toBeCloseTo(
        FOOTHOLD_DEPTH,
        0,
      );
      expect(
        Math.abs(corpseCenterX(pile[i]) - corpseCenterX(pile[i - 1])),
        'piled, not spread out',
      ).toBeLessThan(pile[i].footWidth);
    }
    expect(corpseCenterX(pile[0]), 'thrown forward').toBeGreaterThan(
      thrower.player!.x + WORLD.playerWidth / 2 + 10,
    );
    expect(findCorpse(landed, spare.id)!.carrierId, 'the fourth was never picked up').toBeNull();
    await p.attachCanvas(testInfo, 'thrown pile');
  });

  test('attack throws the carried stack, even beside a corpse it could pick up', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);

    const pile: E2eCorpseView[] = await lyingCorpses(p, 500, 2);
    await p.face('right');
    await p.probe.teleport(
      corpseCenterX(pile[0]) - WORLD.playerWidth / 2,
      corpseFeet(pile[0]) - WORLD.playerHeight,
    );
    await p.wait(300);
    await p.press(KEYS.carry, 70);
    await p.probe.waitFor(
      'carrying one',
      (s: E2eSnapshot): boolean => s.player!.carryingCorpseIds.length === 1,
    );

    await p.hold(KEYS.attack);
    let swung: boolean = false;
    for (let i: number = 0; i < 6; i++) {
      await p.wait(50);
      const s: E2eSnapshot = await p.probe.state();
      if (s.player!.isAttacking && s.player!.carryingCorpseIds.length > 0) swung = true;
    }
    await p.release(KEYS.attack);
    expect(swung, 'no swing with full hands').toBe(false);
    await p.probe.waitFor(
      'thrown',
      (s: E2eSnapshot): boolean =>
        s.player!.carryingCorpseIds.length === 0 &&
        s.corpseViews.every((c: E2eCorpseView): boolean => c.carrierId === null),
    );
  });

  test('a carried corpse droops over the head, bounces with every step and lags a jump', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);

    const corpse: E2eCorpseView = await lyingCorpse(p, 400);
    await p.face('right');
    await p.probe.teleport(
      corpseCenterX(corpse) - WORLD.playerWidth / 2,
      corpseFeet(corpse) - WORLD.playerHeight,
    );
    await p.wait(300);
    await p.press(KEYS.carry, 70);
    await p.probe.waitFor(
      'carrying it',
      (s: E2eSnapshot): boolean => findCorpse(s, corpse.id)?.carrierId === s.player!.id,
    );
    await p.wait(500);
    const still: CarryPose = findCorpse(await p.probe.state(), corpse.id)!.carryPose!;
    expect(still.sag, 'the limp body hangs over the head').toBeGreaterThan(1);
    expect(Math.abs(still.bob), 'standing still, no bounce').toBeLessThan(0.5);

    const walking: CarryPose[] = [];
    await p.hold(KEYS.right);
    for (let i: number = 0; i < 12; i++) {
      await p.wait(40);
      const s: E2eSnapshot = await p.probe.state();
      const pose: CarryPose | null = findCorpse(s, corpse.id)?.carryPose ?? null;
      if (pose && s.player!.isGrounded) walking.push(pose);
    }
    await p.release(KEYS.right);
    const bobs: number[] = walking.map((w: CarryPose): number => w.bob);
    expect(Math.max(...bobs) - Math.min(...bobs), 'it bounces as the carrier walks').toBeGreaterThan(1);
    expect(Math.max(...bobs), 'footfalls lift it, never push it into the head').toBeLessThan(0.5);
    await p.attachCanvas(testInfo, 'walking with a corpse');

    await p.wait(500);
    await p.hold(KEYS.jump);
    const pressed: CarryPose = (
      await p.probe.waitFor(
        'pressed down onto the head on the way up',
        (s: E2eSnapshot): boolean =>
          s.player!.velocityY < 0 && (findCorpse(s, corpse.id)?.carryPose?.bob ?? 0) > 0.5,
        { timeoutMs: 3_000 },
      )
    ).corpseViews.find((c: E2eCorpseView): boolean => c.id === corpse.id)!.carryPose!;
    await p.release(KEYS.jump);
    expect(pressed.sag, 'its ends hang lower going up').toBeGreaterThan(still.sag);
  });
});
