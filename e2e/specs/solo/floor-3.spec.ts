import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { E2eGadgetView, E2eGeometryReport, E2eSnapshot } from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';

/** Floor 3 (DESIGNED_LEVELS[3]). */
const FLOOR: number = 3;
const WALL: string = 'g2';
const DOOR: string = 'g3';
const BOULDER: string = 'g4';
const BUTTON: { id: string; x: number; width: number } = { id: 'g5', x: 640, width: 48 };
/** The shut door's right side: the boulder rests against it. */
const DOOR_RIGHT: number = 352;
/** Two bodies are 110 kg at the least (ZOMBIE_TYPES weightKg): more than the button's 60 kg. */
const BODIES_ON_BUTTON: number = 2;

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

/** The designed floor 3, with nobody but the player around. */
async function quietFloor3(solo: SoloFactory): Promise<GamePlayer> {
  const p: GamePlayer = await solo('warrior');
  await p.probe.setDesignedFloors(true);
  await p.probe.setGodMode(true);
  await p.probe.pauseZombieSpawns(true);
  await p.probe.setFloor(FLOOR);
  await p.probe.waitFor('floor 3', (st: E2eSnapshot): boolean => st.floor === FLOOR);
  await p.probe.clearZombies();
  return p;
}

test.describe('floor 3: the boulder behind the door', { tag: '@solo' }, (): void => {
  test('the floor is the designed one: art matches collision, the boulder waits at the shut door', async (
    { solo }: { solo: SoloFactory },
    testInfo: TestInfo,
  ): Promise<void> => {
    const p: GamePlayer = await quietFloor3(solo);
    const s: E2eSnapshot = await p.probe.waitFor(
      'the boulder came down on the slope and rests against the door',
      (st: E2eSnapshot): boolean => {
        const body: E2eGadgetView['body'] = gadget(st, BOULDER).body;
        return body !== null && body.grounded && Math.abs(body.vx) < 0.1;
      },
      { timeoutMs: 8_000 },
    );
    expect(gadget(s, BUTTON.id).targets).toEqual([DOOR]);
    expect(gadget(s, DOOR).openTicks).toBe(0);
    expect(gadget(s, WALL).broken).toBe(false);
    expect(gadget(s, BOULDER).body!.x).toBeGreaterThanOrEqual(DOOR_RIGHT - 1);
    const report: E2eGeometryReport = await drawnGeometry(p, 'floor 3');
    await p.attachCanvas(testInfo, 'floor 3');
    expectArtMatchesCollision(report, 'floor 3');
  });

  test('bodies on the button open the door: the boulder rolls through and breaks the wall', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await quietFloor3(solo);
    await p.wait(1_500);
    await p.probe.dropCorpses(BUTTON.x + BUTTON.width / 2, BODIES_ON_BUTTON);
    await p.probe.waitFor(
      'the door opens',
      (st: E2eSnapshot): boolean => gadget(st, DOOR).openTicks > 0,
      { timeoutMs: 10_000 },
    );
    await p.probe.waitFor(
      'the boulder broke the cracked wall',
      (st: E2eSnapshot): boolean => gadget(st, WALL).broken,
      { timeoutMs: 15_000 },
    );
  });
});
