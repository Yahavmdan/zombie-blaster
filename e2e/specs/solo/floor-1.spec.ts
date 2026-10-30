import { test, expect, SoloFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

type PropView = E2eSnapshot['level']['props'][number];

/** Floor 1 (designed in the level editor): the exit door on the right ledge, its button far left. */
const DOOR: { id: string; x: number; width: number; floorY: number } = {
  id: 'g1',
  x: 1172,
  width: 64,
  floorY: 452,
};
/** Mirrors GADGET_DOOR_TICKS in shared/game-constants.ts: a door this many ticks open is fully open. */
const DOOR_TICKS: number = 30;
const BUTTON: { id: string; x: number; width: number } = { id: 'g2', x: 104, width: 48 };

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

/** Floor 1 with nobody but the player around. */
async function quietFloor1(solo: SoloFactory): Promise<GamePlayer> {
  const p: GamePlayer = await solo('warrior');
  await p.probe.setGodMode(true);
  await p.probe.clearZombies();
  return p;
}

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
    expect(s.level.platforms).toEqual([{ x: 1120, y: DOOR.floorY, width: 160, height: 32 }]);

    // Standing on the button holds the door open; stepping off lets it shut.
    await p.probe.teleport(
      BUTTON.x + BUTTON.width / 2 - WORLD.playerWidth / 2,
      WORLD.groundY - WORLD.playerHeight,
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
    await p.probe.dropProp(box!.id!, BUTTON.x + 10, 500);
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
