import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCorpseView, E2eGadgetView, E2eGeometryReport, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';

/** Floor 2 (DESIGNED_LEVELS[2]). */
const FLOOR: number = 2;
const TALL_DOOR: { id: string; x: number; width: number } = { id: 'g1', x: 1076, width: 32 };
const EXIT_DOOR: { id: string; x: number } = { id: 'g2', x: 1164 };
/** Opens the exit door, on the right ledge. */
const EXIT_BUTTON: { id: string; x: number; y: number; width: number } = {
  id: 'g3',
  x: 660,
  y: 300,
  width: 48,
};
/** Opens the tall door, on the high ledge. */
const TALL_BUTTON: { id: string; x: number; y: number; width: number } = {
  id: 'g4',
  x: 408,
  y: 208,
  width: 48,
};
/** Bodies dropped clear of the right ledge (nearer, they catch its end and stack up there). */
const PILE_X: number = 815;
const PILE_BODIES: number = 50;
/** A body above this line is still falling: the pile never gets this high. */
const SETTLED_BELOW_Y: number = 150;
/** A held jump rises about this far (PLAYER_JUMP_FORCE, GRAVITY). */
const MAX_JUMP_PX: number = 120;
/** Mirrors GADGET_DOOR_TICKS in shared/game-constants.ts. */
const DOOR_TICKS: number = 30;
/** Two bodies are 110 kg at the least (ZOMBIE_TYPES weightKg): more than a button's 60 kg. */
const BODIES_ON_BUTTON: number = 2;

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

function buttonMid(button: { x: number; width: number }): number {
  return button.x + button.width / 2;
}

/** The designed floor 2, with nobody but the player around. */
async function quietFloor2(solo: SoloFactory): Promise<GamePlayer> {
  const p: GamePlayer = await solo('warrior');
  await p.probe.setDesignedFloors(true);
  await p.probe.setGodMode(true);
  await p.probe.pauseZombieSpawns(true);
  await p.probe.setFloor(FLOOR);
  await p.probe.waitFor('floor 2', (st: E2eSnapshot): boolean => st.floor === FLOOR);
  await p.probe.clearZombies();
  return p;
}

test.describe('floor 2: two buttons, two doors', { tag: '@solo' }, (): void => {
  test('the floor is the designed one: both doors shut, each button wired to its door', async (
    { solo }: { solo: SoloFactory },
    testInfo: TestInfo,
  ): Promise<void> => {
    const p: GamePlayer = await quietFloor2(solo);
    const s: E2eSnapshot = await p.probe.state();
    expect(s.gadgets.map((g: E2eGadgetView): string => g.kind)).toEqual([
      'door',
      'door',
      'button',
      'button',
    ]);
    expect(s.puzzle, 'no boulder puzzle here').toBeNull();
    expect(gadget(s, TALL_BUTTON.id).targets).toEqual([TALL_DOOR.id]);
    expect(gadget(s, EXIT_BUTTON.id).targets).toEqual([EXIT_DOOR.id]);
    expect(gadget(s, TALL_DOOR.id).openTicks).toBe(0);
    expect(gadget(s, EXIT_DOOR.id).openTicks).toBe(0);
    const report: E2eGeometryReport = await drawnGeometry(p, 'floor 2');
    await p.attachCanvas(testInfo, 'floor 2');
    expectArtMatchesCollision(report, 'floor 2');
  });

  test('the shut tall door blocks the way to the exit door', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await quietFloor2(solo);
    await p.probe.teleport(TALL_DOOR.x - WORLD.playerWidth - 20, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.wait(1_200);
    const st: E2eSnapshot = await p.probe.state();
    await p.release(KEYS.right);
    expect(st.player!.x + WORLD.playerWidth, 'stopped at the door').toBeLessThanOrEqual(
      TALL_DOOR.x + 1,
    );
  });

  test('no ladders: the pile of the dead beside the right ledge gets within a jump of it', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await quietFloor2(solo);
    await p.probe.dropCorpses(PILE_X, PILE_BODIES);
    // Bodies start stacked high above the screen: every last one must be down on the pile.
    await p.probe.waitFor(
      'the bodies landed',
      (st: E2eSnapshot): boolean =>
        st.corpseViews.length >= PILE_BODIES &&
        st.corpseViews.every((c: E2eCorpseView): boolean => c.isGrounded && c.footY > SETTLED_BELOW_Y),
      { timeoutMs: 30_000 },
    );
    await p.wait(1_000);
    const piled: E2eSnapshot = await p.probe.state();
    const top: E2eCorpseView = piled.corpseViews.reduce(
      (best: E2eCorpseView, c: E2eCorpseView): E2eCorpseView => (c.footY < best.footY ? c : best),
    );
    expect(top.footY - EXIT_BUTTON.y, 'the ledge is within a jump of the pile').toBeLessThan(MAX_JUMP_PX);
  });

  test('one button is not enough; bodies on both open the way and the exit door ends the floor', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await quietFloor2(solo);

    await p.probe.dropCorpses(buttonMid(TALL_BUTTON), BODIES_ON_BUTTON);
    const tallOpen: E2eSnapshot = await p.probe.waitFor(
      'bodies on the high button open the tall door',
      (st: E2eSnapshot): boolean => gadget(st, TALL_DOOR.id).openTicks >= DOOR_TICKS,
      { timeoutMs: 10_000 },
    );
    expect(gadget(tallOpen, EXIT_DOOR.id).openTicks, 'the exit door stays shut').toBe(0);

    // Past the open tall door, in front of the shut exit door: no way out yet.
    await p.probe.teleport(EXIT_DOOR.x - WORLD.playerWidth - 12, WORLD.groundY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.wait(800);
    expect((await p.probe.state()).floor, 'a shut exit door lets nobody out').toBe(FLOOR);

    await p.probe.dropCorpses(buttonMid(EXIT_BUTTON), BODIES_ON_BUTTON);
    await p.probe.waitFor(
      'the exit door opens and the floor ends',
      (st: E2eSnapshot): boolean => st.floor === FLOOR + 1,
      { timeoutMs: 12_000 },
    );
    await p.release(KEYS.right);
  });
});
