import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';
import { layoutWhere } from '../../support/navigation';
import {
  clearAround,
  findProp,
  hasPropOnTop,
  LevelProp,
  pickableOnGround,
  propCenterX,
  standLeftOf,
  STEP_UP_PX,
} from '../../support/props';

test.describe('map props', { tag: '@solo' }, (): void => {
  test('E picks up a barrel or box: it rides overhead, flies when thrown and lies solid where it lands', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone pickable prop on open ground',
      (s: E2eSnapshot): boolean => pickableOnGround(s) !== undefined,
    );
    const prop: LevelProp = pickableOnGround(s0)!;
    const id: string = prop.id!;
    await standLeftOf(p, prop);

    await p.press(KEYS.carry, 70);
    const carrying: E2eSnapshot = await p.probe.waitFor(
      `the ${prop.kind} is picked up`,
      (s: E2eSnapshot): boolean =>
        s.player!.carryingCorpseIds.includes(id) && findProp(s, id)?.carrierId === s.player!.id,
    );
    const held: LevelProp = findProp(carrying, id)!;
    expect(held.isGrounded, 'out of the world while carried').toBe(false);
    expect(Math.abs(propCenterX(held) - (carrying.player!.x + WORLD.playerWidth / 2))).toBeLessThan(
      2,
    );
    expect(held.y + held.height, "it sits on the carrier's head").toBe(carrying.player!.y);
    await p.attachCanvas(testInfo, `carrying a ${prop.kind}`);

    const thrower: E2eSnapshot = await p.probe.state();
    await p.press(KEYS.carry, 70);
    const landed: E2eSnapshot = await p.probe.waitFor(
      'the thrown prop lands',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        return (
          s.player!.carryingCorpseIds.length === 0 && !!q && q.carrierId === null && q.isGrounded
        );
      },
    );
    const lying: LevelProp = findProp(landed, id)!;
    expect(propCenterX(lying), 'thrown forward, the way the carrier faces').toBeGreaterThan(
      thrower.player!.x + WORLD.playerWidth / 2 + 10,
    );
    await p.attachCanvas(testInfo, 'thrown prop');

    // Where it landed, its art is its collision box, and you stand on it.
    expectArtMatchesCollision(await drawnGeometry(p, 'after the throw'), 'after the throw');
    await p.probe.teleport(
      propCenterX(lying) - WORLD.playerWidth / 2,
      lying.y - WORLD.playerHeight - 30,
    );
    await p.probe.waitFor(
      'the player lands on the thrown prop',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.player!.y + WORLD.playerHeight === findProp(s, id)!.y,
    );
  });

  test('walking into a low prop steps you up onto it and on over it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const lowProp: (s: E2eSnapshot) => LevelProp | undefined = (
      s: E2eSnapshot,
    ): LevelProp | undefined =>
      s.level.props.find(
        (q: LevelProp): boolean =>
          q.y + q.height === WORLD.groundY &&
          q.height <= STEP_UP_PX &&
          q.x > 150 &&
          q.x + q.width < WORLD.width - 200 &&
          !hasPropOnTop(s, q) &&
          clearAround(s, q, 110, 120),
      );
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone low prop on open ground',
      (s: E2eSnapshot): boolean => lowProp(s) !== undefined,
    );
    const prop: LevelProp = lowProp(s0)!;
    await p.face('right');
    await p.probe.teleport(prop.x - 90, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);

    let highestFeet: number = WORLD.groundY;
    await p.hold(KEYS.right);
    for (let i: number = 0; i < 30; i++) {
      await p.wait(40);
      const s: E2eSnapshot = await p.probe.state();
      highestFeet = Math.min(highestFeet, s.player!.y + WORLD.playerHeight);
      if (s.player!.x > prop.x + prop.width + 10) break;
    }
    await p.release(KEYS.right);
    const s: E2eSnapshot = await p.probe.state();
    expect(highestFeet, `stepped onto the ${prop.kind}'s top (${prop.y})`).toBe(prop.y);
    expect(s.player!.x, 'and walked on past it').toBeGreaterThan(prop.x + prop.width);
  });
});
