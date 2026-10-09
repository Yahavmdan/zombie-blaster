import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';
import { layoutWhere } from '../../support/navigation';
import { findProp, isBarrel, LevelProp, pickableOnGround, standLeftOf } from '../../support/props';
import { typesOf, vfxQueuedBy } from '../../support/vfx-gate';

/** Mirrors BARREL_FUSE_TICKS in shared/game-constants.ts: 3 s at 50 ticks/s. */
const FUSE_TICKS: number = 150;

test.describe('exploding barrels', { tag: '@solo' }, (): void => {
  test('a hit lights a barrel: its fuse counts down 3 s, then it blows up and is gone', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone barrel on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBarrel) !== undefined,
    );
    const barrel: LevelProp = pickableOnGround(s0, isBarrel)!;
    const id: string = barrel.id!;
    await standLeftOf(p, barrel);

    const lighting: E2eVfxLogEntry[] = await vfxQueuedBy(p, async (): Promise<void> => {
      await p.press(KEYS.attack, 70);
    });
    const lit: E2eSnapshot = await p.probe.waitFor(
      'the hit lights the fuse',
      (s: E2eSnapshot): boolean => (findProp(s, id)?.fuseTicks ?? 0) > 0,
    );
    const litAt: number = Date.now();
    expect(typesOf(lighting), 'sparks as the fuse catches, queued for the others').toContain(
      'hit-particles',
    );
    expect(findProp(lit, id)!.fuseTicks).toBeGreaterThan(FUSE_TICKS - 40);
    await p.attachCanvas(testInfo, 'lit barrel counting down');

    // Halfway: still there, still burning.
    await p.wait(1_200);
    const burning: LevelProp | undefined = findProp(await p.probe.state(), id);
    expect(burning?.exploded).toBe(false);
    expect(burning?.fuseTicks).toBeGreaterThan(0);
    expect(burning!.fuseTicks).toBeLessThan(FUSE_TICKS - 40);

    await p.probe.waitFor(
      'the barrel blows up',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    const blewAt: number = Date.now();
    expect(blewAt - litAt, 'about 3 s after the hit').toBeGreaterThan(2_000);
    await p.attachCanvas(testInfo, 'barrel blowing up');
    const blast: E2eVfxLogEntry | undefined = (await p.probe.vfxLog()).find(
      (e: E2eVfxLogEntry): boolean => e.type === 'barrel-blast',
    );
    expect(blast, 'the blast is queued for the other players').toBeDefined();
    await p.wait(250);
    await p.attachCanvas(testInfo, 'fireball and shockwave');

    // Gone from the world: what is drawn is still exactly what is solid.
    expectArtMatchesCollision(await drawnGeometry(p, 'after the blast'), 'after the blast');

    // 10 s later it is back where the floor first put it, unlit.
    const back: E2eSnapshot = await p.probe.waitFor(
      'the barrel is back on its spawn spot',
      (s: E2eSnapshot): boolean => findProp(s, id)?.exploded === false,
      { timeoutMs: 20_000 },
    );
    expect(Date.now() - blewAt, 'about 10 s after the blast').toBeGreaterThan(8_000);
    expect(findProp(back, id)).toMatchObject({
      x: barrel.x,
      y: barrel.y,
      fuseTicks: 0,
      pickable: true,
      isGrounded: true,
    });
    expect(
      (await p.probe.vfxLog()).some((e: E2eVfxLogEntry): boolean => e.type === 'barrel-respawn'),
      'its return is queued for the other players',
    ).toBe(true);
    await p.attachCanvas(testInfo, 'barrel back');
    expectArtMatchesCollision(await drawnGeometry(p, 'barrel back'), 'barrel back');
  });

  test('every floor has 5 to 10 barrels', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    for (const floor of [1, 2, 3, 4, 5, 6]) {
      if (floor > 1) await p.probe.setFloor(floor);
      const s: E2eSnapshot = await p.probe.waitFor(
        `floor ${floor}`,
        (st: E2eSnapshot): boolean => st.floor === floor,
      );
      const barrels: number = s.level.props.filter(isBarrel).length;
      expect(barrels, `floor ${floor}`).toBeGreaterThanOrEqual(5);
      expect(barrels, `floor ${floor}`).toBeLessThanOrEqual(10);
    }
  });

  test('boxes are not explosive: a hit leaves them unlit', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const isBox: (q: LevelProp) => boolean = (q: LevelProp): boolean => !isBarrel(q);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone box on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s, isBox) !== undefined,
    );
    const box: LevelProp = pickableOnGround(s0, isBox)!;
    await standLeftOf(p, box);
    await p.press(KEYS.attack, 70);
    await p.wait(600);
    const after: LevelProp | undefined = findProp(await p.probe.state(), box.id!);
    expect(after?.fuseTicks).toBe(0);
    expect(after?.exploded).toBe(false);
  });
});
