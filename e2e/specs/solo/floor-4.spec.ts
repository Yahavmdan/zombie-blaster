import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eGadgetView, E2eGeometryReport, E2eSnapshot } from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';

/** Floor 4 (DESIGNED_LEVELS[4]). */
const FLOOR: number = 4;
const NEAR_DOOR: string = 'g3';
/** The door at the foot of the left slope: the left button opens it with the near door. */
const SLOPE_DOOR: string = 'g19';
const FAR_DOOR: string = 'g8';
const BOULDER: string = 'g13';
const LEFT_BUTTON: string = 'g7';
const LEDGE_BUTTON: string = 'g11';
/** The shut near door's right side: the boulder rolls down the slope to rest against it. */
const NEAR_DOOR_RIGHT: number = 1008;

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

test.describe('floor 4: the boulder behind two doors', { tag: '@solo' }, (): void => {
  test('the floor is the designed one: art matches collision, the boulder waits at the shut door', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await solo('warrior');
    await p.probe.setDesignedFloors(true);
    await p.probe.setGodMode(true);
    await p.probe.pauseZombieSpawns(true);
    await p.probe.setFloor(FLOOR);
    await p.probe.waitFor('floor 4', (st: E2eSnapshot): boolean => st.floor === FLOOR);
    await p.probe.clearZombies();
    const s: E2eSnapshot = await p.probe.waitFor(
      'the boulder rolled down the slope and rests against the near door',
      (st: E2eSnapshot): boolean => {
        const body: E2eGadgetView['body'] = gadget(st, BOULDER).body;
        return body !== null && body.grounded && Math.abs(body.vx) < 0.1;
      },
      { timeoutMs: 8_000 },
    );
    expect(gadget(s, LEFT_BUTTON).targets).toEqual([NEAR_DOOR, SLOPE_DOOR]);
    expect(gadget(s, LEDGE_BUTTON).targets).toEqual([FAR_DOOR]);
    expect(gadget(s, NEAR_DOOR).openTicks).toBe(0);
    expect(gadget(s, SLOPE_DOOR).openTicks).toBe(0);
    expect(gadget(s, BOULDER).body!.x).toBeGreaterThanOrEqual(NEAR_DOOR_RIGHT - 1);
    const report: E2eGeometryReport = await drawnGeometry(p, 'floor 4');
    await p.attachCanvas(testInfo, 'floor 4');
    expectArtMatchesCollision(report, 'floor 4');
  });
});
