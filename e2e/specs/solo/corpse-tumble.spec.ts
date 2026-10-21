import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { layoutWhere } from '../../support/navigation';
import {
  barrelWithOpenSkyBeside,
  clearPickablesBetween,
  CORPSE_DROP_DX,
  dropLyingCorpses,
  findProp,
  isLongRail,
  LevelProp,
  pickableOnGround,
  propCenterX,
  standLeftOf,
} from '../../support/props';

/** Mirrors CORPSE_MAX_TILT in shared/game-constants.ts: a flying body tilts, never cartwheels. */
const CORPSE_MAX_TILT: number = 0.6;
/** Mirrors PROP_RAIL_MAX_TILT in shared/game-constants.ts. */
const RAIL_MAX_TILT: number = 0.45;
/** One tick of turning past the limit is allowed (it stops turning once over it). */
const TILT_SLACK: number = 0.1;
/** Sample fast: a toss is in the air for only ~25 ticks. */
const SAMPLE_MS: number = 10;
/** The probe's foothold top sits this far above the corpse's feet (ZOMBIE_CORPSE_PLATFORM_HEIGHT). */
const FOOTHOLD_DEPTH: number = 5;

function findCorpse(s: E2eSnapshot, id: string): E2eCorpseView | undefined {
  return s.corpseViews.find((c: E2eCorpseView): boolean => c.id === id);
}

function corpseCenterX(c: E2eCorpseView): number {
  return c.footX + c.footWidth / 2;
}

/** Watches the corpse until it lies flat and still; returns the most it tilted and the rest state. */
async function tiltUntilFlat(
  p: GamePlayer,
  id: string,
  description: string,
): Promise<{ most: number; rested: E2eSnapshot }> {
  let most: number = 0;
  let wasFlying: boolean = false;
  const rested: E2eSnapshot = await p.probe.waitFor(
    description,
    (s: E2eSnapshot): boolean => {
      const c: E2eCorpseView | undefined = findCorpse(s, id);
      if (!c || c.carrierId !== null) return false;
      most = Math.max(most, Math.abs(c.angle));
      if (!c.isGrounded) wasFlying = true;
      return wasFlying && c.isGrounded && c.angle === 0;
    },
    { timeoutMs: 8_000, intervalMs: SAMPLE_MS },
  );
  return { most, rested };
}

test.describe('tumbling corpses', { tag: '@solo' }, (): void => {
  test('a tossed corpse tilts the way it flies, then flops flat where it lands', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    await clearPickablesBetween(p, [], 300, 1000);
    const [corpse]: E2eCorpseView[] = await dropLyingCorpses(p, [], 500, 1);
    await p.face('right');
    await p.probe.teleport(
      corpseCenterX(corpse) - WORLD.playerWidth / 2,
      corpse.footY + FOOTHOLD_DEPTH - WORLD.playerHeight,
    );
    await p.wait(300);
    await p.press(KEYS.carry, 70);
    await p.probe.waitFor(
      'the corpse is picked up',
      (s: E2eSnapshot): boolean => findCorpse(s, corpse.id)?.carrierId === s.player!.id,
    );
    await p.wait(200);
    const thrower: number = (await p.probe.state()).player!.x;
    await p.press(KEYS.carry, 70);

    const { most, rested }: { most: number; rested: E2eSnapshot } = await tiltUntilFlat(
      p,
      corpse.id,
      'the tossed corpse flies tilting and comes to lie flat',
    );
    expect(most, 'it tilted in the air').toBeGreaterThan(0.1);
    expect(most, 'a limp body tilts, it does not cartwheel').toBeLessThan(
      CORPSE_MAX_TILT + TILT_SLACK,
    );
    const lying: E2eCorpseView = findCorpse(rested, corpse.id)!;
    expect(corpseCenterX(lying), 'thrown forward').toBeGreaterThan(thrower + WORLD.playerWidth);
    await p.attachCanvas(testInfo, 'tossed corpse lying flat');
  });

  test('a barrel blast throws corpses tilting away; they land and lie flat', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone barrel on open ground, open sky beside it',
      (s: E2eSnapshot): boolean => barrelWithOpenSkyBeside(s) !== undefined,
    );
    const barrel: LevelProp = barrelWithOpenSkyBeside(s0)!;
    const [corpse]: E2eCorpseView[] = await dropLyingCorpses(
      p,
      [],
      propCenterX(barrel) + CORPSE_DROP_DX,
      1,
    );
    await standLeftOf(p, barrel);
    await p.press(KEYS.attack, 70);
    await p.probe.waitFor(
      'the barrel blows up',
      (s: E2eSnapshot): boolean => findProp(s, barrel.id!)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    const { most, rested }: { most: number; rested: E2eSnapshot } = await tiltUntilFlat(
      p,
      corpse.id,
      'the blasted corpse flies tilting and comes to lie flat',
    );
    // Each body turns a random 0.5-1.5x of CORPSE_BLAST_SPIN: some only a little.
    expect(most, 'the blast turned it').toBeGreaterThan(0.15);
    expect(most, 'it never cartwheels').toBeLessThan(CORPSE_MAX_TILT + TILT_SLACK);
    expect(findCorpse(rested, corpse.id)!.x, 'thrown away from the barrel').toBeGreaterThan(
      corpse.x + 30,
    );
    await p.attachCanvas(testInfo, 'blasted corpse lying flat');
  });

  test('a thrown rail tilts a little but never spins round; it lands upright', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a long rail on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isLongRail) !== undefined,
    );
    const rail: LevelProp = pickableOnGround(s0, isLongRail)!;
    const id: string = rail.id!;
    await standLeftOf(p, rail);
    await p.press(KEYS.carry, 70);
    await p.probe.waitFor(
      'the rail is picked up',
      (s: E2eSnapshot): boolean => findProp(s, id)?.carrierId === s.player!.id,
    );
    // Under suite load a press can fall between ticks: press until it leaves the hands.
    for (let attempt: number = 0; attempt < 3; attempt++) {
      await p.press(KEYS.carry, 70);
      await p.wait(100);
      if (findProp(await p.probe.state(), id)?.carrierId === null) break;
    }

    let most: number = 0;
    const rested: E2eSnapshot = await p.probe.waitFor(
      'the rail flies, lands and rests upright',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        if (!q || q.carrierId !== null) return false;
        most = Math.max(most, Math.abs(q.angle));
        return q.resting;
      },
      { timeoutMs: 10_000, intervalMs: SAMPLE_MS },
    );
    expect(most, 'it tilted a bit').toBeGreaterThan(0.05);
    expect(most, 'never past a slight tilt').toBeLessThan(RAIL_MAX_TILT + TILT_SLACK);
    expect(findProp(rested, id)!.angle).toBe(0);
  });
});
