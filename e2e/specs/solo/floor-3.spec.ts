import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eGeometryReport, E2eSnapshot } from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';
import { WORLD } from '../../support/invariants';

/** Floor 3 (DESIGNED_LEVELS[3]). */
const FLOOR: number = 3;
const WALL: string = 'g9';
const DOOR: string = 'g7';
const BOULDER: string = 'g6';
const BUTTON: { id: string; x: number; width: number } = { id: 'g5', x: 784, width: 48 };
/** The shut door's right side: the boulder rests against it. */
const DOOR_RIGHT: number = 388;
/** Two bodies are 110 kg at the least (ZOMBIE_TYPES weightKg): more than the button's 60 kg. */
const BODIES_ON_BUTTON: number = 2;
/** Lie by the low ledge from the start (the floor's zombie pile). */
const PILE_BODIES: number = 30;
/** Clear of the hole's right side, on the ground: from here the exit door is a walk left. */
const PAST_THE_DOOR_X: number = 200;
/** Left of this the player is over the exit door (x 28, 64 wide). */
const IN_THE_DOORWAY_X: number = 56;

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
    expect(s.corpseViews.length, 'the pile lies there').toBeGreaterThanOrEqual(PILE_BODIES);
    expect(gadget(s, BOULDER).body!.x).toBeGreaterThanOrEqual(DOOR_RIGHT - 1);
    const report: E2eGeometryReport = await drawnGeometry(p, 'floor 3');
    await p.attachCanvas(testInfo, 'floor 3');
    expectArtMatchesCollision(report, 'floor 3');
  });

  test('bodies on the button open the door, the boulder breaks the wall, the exit door ends the floor', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await quietFloor3(solo);
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
    await p.wait(2_000);
    await p.probe.teleport(PAST_THE_DOOR_X, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.left);
    // The boulder comes to rest in front of the exit door: hop over it, then let go in the doorway.
    await p.hold(KEYS.jump);
    await p.probe.waitFor(
      'past the boulder, over the exit door',
      (st: E2eSnapshot): boolean => st.player!.x < IN_THE_DOORWAY_X,
      { timeoutMs: 6_000, intervalMs: 20 },
    );
    await p.release(KEYS.left);
    await p.release(KEYS.jump);
    await p.wait(500);
    // The hop can carry the player past the door to the screen edge: step back into it.
    await p.hold(KEYS.right);
    await p.probe.waitFor(
      'standing in the exit door ends the floor',
      (st: E2eSnapshot): boolean => st.floor === FLOOR + 1,
      { timeoutMs: 6_000 },
    );
    await p.release(KEYS.right);
  });
});
