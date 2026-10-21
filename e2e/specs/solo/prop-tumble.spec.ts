import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';
import { layoutWhere } from '../../support/navigation';
import {
  barrelWithOpenSkyBeside,
  findProp,
  isBarrel,
  LevelProp,
  Overhang,
  overhangSetup,
  pickableOnGround,
  propCenterX,
  standLeftOf,
} from '../../support/props';

test.describe('tumbling props', { tag: '@solo' }, (): void => {
  test('a rail lying with its middle past a ledge tips off the edge and comes to rest upright below', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a rail and a ledge with room past its end',
      (s: E2eSnapshot): boolean => overhangSetup(s) !== undefined,
    );
    const setup: Overhang = overhangSetup(s0)!;
    const id: string = setup.rail.id!;
    const edge: number = setup.ledge.x + setup.ledge.width;
    await p.probe.dropProp(id, setup.dropX, setup.dropY);

    let turned: number = 0;
    let sawTip: boolean = false;
    const rested: E2eSnapshot = await p.probe.waitFor(
      'the rail tips off the ledge and settles upright',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        if (!q) return false;
        turned = Math.max(turned, q.angle);
        if (q.angle > 0.05 && q.y < setup.ledge.y + 40) sawTip = true;
        return q.resting && q.y + q.height > setup.ledge.y;
      },
      { timeoutMs: 10_000 },
    );
    const rail: LevelProp = findProp(rested, id)!;
    expect(sawTip, 'it turned down over the edge before falling').toBe(true);
    expect(turned, 'clockwise: the hanging (right) end goes down').toBeGreaterThan(0.3);
    expect(rail.angle).toBe(0);
    expect(propCenterX(rail), 'it fell off on the hanging side').toBeGreaterThan(edge);
    await p.attachCanvas(testInfo, 'rail tipped off the ledge');
    expectArtMatchesCollision(await drawnGeometry(p, 'after the tip'), 'after the tip');
  });

  test('a thrown barrel rolls on after it lands, turning as it goes', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
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
    await p.press(KEYS.carry, 70);
    await p.probe.waitFor(
      'the barrel is picked up',
      (s: E2eSnapshot): boolean => findProp(s, id)?.carrierId === s.player!.id,
    );
    await p.press(KEYS.carry, 70);

    let landedX: number | null = null;
    let rollTurn: number = 0;
    const rested: E2eSnapshot = await p.probe.waitFor(
      'the barrel lands, rolls and stops',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, id);
        if (!q || q.carrierId !== null) return false;
        if (q.isGrounded && landedX === null) landedX = q.x;
        if (q.isGrounded) rollTurn = Math.max(rollTurn, Math.abs(q.angle));
        return q.resting;
      },
      { timeoutMs: 10_000 },
    );
    const lying: LevelProp = findProp(rested, id)!;
    expect(landedX).not.toBeNull();
    expect(lying.x - landedX!, 'it rolled on after landing').toBeGreaterThan(15);
    expect(rollTurn, 'turning while it rolled').toBeGreaterThan(0.5);
    expect(lying.angle).toBe(0);
  });

  test('a barrel blast throws a box lying beside it tumbling away; it lands upright', async ({
    solo,
  }: {
    solo: SoloFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(90_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setGodMode(true);
    const isBox: (q: LevelProp) => boolean = (q: LevelProp): boolean =>
      q.kind.startsWith('box') && q.pickable && q.resting;
    const s0: E2eSnapshot = await layoutWhere(
      p,
      'a lone barrel on open ground, open sky beside it, and a box',
      (s: E2eSnapshot): boolean =>
        barrelWithOpenSkyBeside(s) !== undefined && s.level.props.some(isBox),
    );
    const barrel: LevelProp = barrelWithOpenSkyBeside(s0)!;
    const box: LevelProp = s0.level.props.find(isBox)!;
    const boxId: string = box.id!;
    await p.probe.dropProp(boxId, propCenterX(barrel) + 40 - box.width / 2, barrel.y - 60);
    const placed: E2eSnapshot = await p.probe.waitFor(
      'the box lies beside the barrel',
      (s: E2eSnapshot): boolean => findProp(s, boxId)?.resting === true,
    );
    const before: LevelProp = findProp(placed, boxId)!;

    await standLeftOf(p, barrel);
    await p.press(KEYS.attack, 70);
    await p.probe.waitFor(
      'the barrel blows up',
      (s: E2eSnapshot): boolean => findProp(s, barrel.id!)?.exploded === true,
      { timeoutMs: 10_000 },
    );
    let turned: number = 0;
    const rested: E2eSnapshot = await p.probe.waitFor(
      'the box flies off tumbling and comes to rest upright',
      (s: E2eSnapshot): boolean => {
        const q: LevelProp | undefined = findProp(s, boxId);
        if (!q) return false;
        turned = Math.max(turned, Math.abs(q.angle));
        return q.resting && propCenterX(q) > propCenterX(before) + 30;
      },
      { timeoutMs: 10_000 },
    );
    expect(turned, 'it tumbled').toBeGreaterThan(0.5);
    expect(findProp(rested, boxId)!.angle).toBe(0);
    await p.attachCanvas(testInfo, 'box thrown by the blast');
  });
});
