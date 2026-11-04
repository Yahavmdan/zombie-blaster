import { TestInfo } from '@playwright/test';
import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';
import { E2eGeometryReport } from '../../support/probe';

type PropView = E2eSnapshot['level']['props'][number];

/** Floor 1 (designed in the level editor): the exit door on the right ledge, its button on the low left ledge. */
const DOOR: { id: string; x: number; width: number; floorY: number } = {
  id: 'g1',
  x: 1172,
  width: 64,
  floorY: 452,
};
/** Mirrors GADGET_DOOR_TICKS in shared/game-constants.ts: a door this many ticks open is fully open. */
const DOOR_TICKS: number = 30;
/** The door's button, set into the top of the low left ledge (y = that ledge's top). */
const BUTTON: { id: string; x: number; y: number; width: number } = {
  id: 'g2',
  x: 376,
  y: 508,
  width: 48,
};

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

/** Floor 1 with nobody but the player around (no clue zombie, no new spawns). */
async function quietFloor1(solo: SoloFactory): Promise<GamePlayer> {
  const p: GamePlayer = await solo('warrior');
  // The fixture plays generated floors: this spec is about the designed one.
  await p.probe.setDesignedFloors(true);
  await p.probe.setGodMode(true);
  await p.probe.pauseZombieSpawns(true);
  await p.probe.skipClueScene();
  await p.probe.clearZombies();
  return p;
}

/** Top of the middle ledge, where the clue zombie rises (DESIGNED_LEVELS[1].clueScene). */
const CLUE_LEDGE_Y: number = 400;

test.describe('floor 1: the clue zombie shows the button', { tag: '@solo' }, (): void => {
  test('a zombie rises on the top-left ledge, drops onto the button, holds the door open, then moves on', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    test.setTimeout(60_000);
    const p: GamePlayer = await solo('warrior');
    await p.probe.setDesignedFloors(true);
    await p.probe.setGodMode(true);
    // Far from the button, so the zombie walks on by itself.
    await p.probe.teleport(900, WORLD.groundY - WORLD.playerHeight);

    const risen: E2eSnapshot = await p.probe.waitFor(
      'the clue zombie rises on the ledge',
      (st: E2eSnapshot): boolean =>
        st.clueScene.phase === 'walking' && st.clueScene.zombieId !== null,
      { timeoutMs: 10_000 },
    );
    const id: string = risen.clueScene.zombieId!;
    const z: E2eSnapshot['zombies'][number] | undefined = risen.zombies.find(
      (zz: E2eSnapshot['zombies'][number]): boolean => zz.id === id,
    );
    expect(z, 'the clue zombie is in the world').toBeDefined();
    expect(Math.round(z!.y + z!.height)).toBe(CLUE_LEDGE_Y);

    const holding: E2eSnapshot = await p.probe.waitFor(
      'it stands on the button and the door opens fully',
      (st: E2eSnapshot): boolean =>
        st.clueScene.phase === 'holding' && gadget(st, DOOR.id).openTicks >= DOOR_TICKS,
      { timeoutMs: 20_000 },
    );
    const onButton: E2eSnapshot['zombies'][number] = holding.zombies.find(
      (zz: E2eSnapshot['zombies'][number]): boolean => zz.id === id,
    )!;
    const mid: number = onButton.x + onButton.width / 2;
    expect(mid).toBeGreaterThanOrEqual(BUTTON.x);
    expect(mid).toBeLessThanOrEqual(BUTTON.x + BUTTON.width);
    expect(gadget(holding, BUTTON.id).on).toBe(true);

    // After its 4 s it hunts the player: off the button, the door shuts.
    await p.probe.teleport(450, WORLD.groundY - WORLD.playerHeight);
    await p.probe.waitFor(
      'the scene ends, the zombie leaves the button and the door shuts',
      (st: E2eSnapshot): boolean =>
        st.clueScene.phase === 'done' &&
        !gadget(st, BUTTON.id).on &&
        gadget(st, DOOR.id).openTicks === 0,
      { timeoutMs: 20_000 },
    );
  });
});

test.describe('floor 1: weigh down the button to open the door', { tag: '@solo' }, (): void => {
  test('the floor is the designed one: no hanging exit, the door shut until the button is pressed', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await quietFloor1(solo);
    const s: E2eSnapshot = await p.probe.state();
    expect(s.floor).toBe(1);
    expect(s.gadgets.map((g: E2eGadgetView): string => g.kind)).toEqual(['door', 'button']);
    expect(gadget(s, BUTTON.id).targets).toEqual([DOOR.id]);
    expect(gadget(s, DOOR.id).on).toBe(false);
    expect(s.level.platforms).toContainEqual({ x: 1120, y: DOOR.floorY, width: 160, height: 32 });

    // Standing on the button holds the door open; stepping off lets it shut.
    await p.probe.teleport(
      BUTTON.x + BUTTON.width / 2 - WORLD.playerWidth / 2,
      BUTTON.y - WORLD.playerHeight,
    );
    await p.probe.waitFor(
      'the button is down and the door opens',
      (st: E2eSnapshot): boolean => gadget(st, BUTTON.id).on && gadget(st, DOOR.id).openTicks > 0,
      { timeoutMs: 5_000 },
    );
    await p.probe.teleport(600, WORLD.groundY - WORLD.playerHeight);
    await p.probe.waitFor(
      'off the button the door shuts again',
      (st: E2eSnapshot): boolean =>
        !gadget(st, BUTTON.id).on && gadget(st, DOOR.id).openTicks === 0,
      { timeoutMs: 5_000 },
    );
  });

  test('the shut exit door is a wall: the player is stopped at it and stays on floor 1', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await quietFloor1(solo);
    await p.probe.teleport(DOOR.x - WORLD.playerWidth - 20, DOOR.floorY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.wait(1_500);
    const st: E2eSnapshot = await p.probe.state();
    await p.release(KEYS.right);
    expect(gadget(st, DOOR.id).openTicks, 'the door stayed shut').toBe(0);
    expect(st.player!.x + WORLD.playerWidth, 'stopped at the shut door').toBeLessThanOrEqual(DOOR.x + 1);
    expect(st.floor, 'a shut door lets nobody out').toBe(1);
  });

  test('what you see is what you stand on: the ledge, the crates and the door', async ({
    solo,
  }: { solo: SoloFactory }, testInfo: TestInfo): Promise<void> => {
    const p: GamePlayer = await quietFloor1(solo);
    const report: E2eGeometryReport = await drawnGeometry(p, 'floor 1');
    await p.attachCanvas(testInfo, 'floor 1');
    expectArtMatchesCollision(report, 'floor 1');
  });

  test('a box left on the button holds the door open: walk in from the ledge to reach floor 2', async ({
    solo,
  }: {
    solo: SoloFactory;
  }): Promise<void> => {
    const p: GamePlayer = await quietFloor1(solo);
    const box: PropView | undefined = (await p.probe.state()).level.props.find(
      (prop: PropView): boolean => prop.pickable && prop.kind.startsWith('box') && prop.id !== null,
    );
    expect(box, 'the crate stack has a box to carry').toBeDefined();
    // Setup: the box lands on the button (carrying it there is the player's part of the puzzle).
    await p.probe.dropProp(box!.id!, BUTTON.x + 10, BUTTON.y - 80);
    await p.probe.waitFor(
      'the box weighs the button down and the door opens fully',
      (st: E2eSnapshot): boolean =>
        gadget(st, DOOR.id).on && gadget(st, DOOR.id).openTicks >= DOOR_TICKS,
      { timeoutMs: 8_000 },
    );

    await p.probe.teleport(DOOR.x - WORLD.playerWidth - 20, DOOR.floorY - WORLD.playerHeight);
    await p.wait(300);
    await p.hold(KEYS.right);
    await p.probe.waitFor('the floor is done', (st: E2eSnapshot): boolean => st.floor === 2, {
      timeoutMs: 6_000,
    });
    await p.release(KEYS.right);
  });
});
