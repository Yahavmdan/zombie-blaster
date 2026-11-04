import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

/** Floor 2 (DESIGNED_LEVELS[2]): tall door g1, exit door g2, their buttons g4 (high ledge) and g3 (right ledge). */
const FLOOR: number = 2;
const TALL_DOOR_ID: string = 'g1';
const EXIT_DOOR_ID: string = 'g2';
const EXIT_BUTTON: { id: string; x: number; y: number; width: number } = {
  id: 'g3',
  x: 660,
  y: 300,
  width: 48,
};
/** Middle of the high ledge's button. */
const TALL_BUTTON_MID: number = 432;
/** Two bodies weigh more than the button's 60 kg. */
const BODIES_ON_BUTTON: number = 2;
/** Mirrors GADGET_DOOR_TICKS in shared/game-constants.ts. */
const DOOR_TICKS: number = 30;

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

function bothDoorsOpen(s: E2eSnapshot): boolean {
  return (
    gadget(s, EXIT_DOOR_ID).openTicks >= DOOR_TICKS &&
    gadget(s, TALL_DOOR_ID).openTicks >= DOOR_TICKS
  );
}

test.describe('floor 2 in co-op', { tag: '@online' }, (): void => {
  test('a guest standing on a button opens its door; the guest sees both doors open', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(90_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'floor2',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setDesignedFloors(true);
    await guest.probe.setDesignedFloors(true);
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.pauseZombieSpawns(true);
    await host.probe.setFloor(FLOOR);
    await guest.probe.waitFor('guest on floor 2', (s: E2eSnapshot): boolean => s.floor === FLOOR);
    await host.probe.clearZombies();

    await guest.probe.teleport(
      EXIT_BUTTON.x + EXIT_BUTTON.width / 2 - WORLD.playerWidth / 2,
      EXIT_BUTTON.y - WORLD.playerHeight,
    );
    await host.probe.dropCorpses(TALL_BUTTON_MID, BODIES_ON_BUTTON);

    await host.probe.waitFor('the host weighs the guest: both doors open', bothDoorsOpen, {
      timeoutMs: 15_000,
    });
    const seen: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees both doors open',
      bothDoorsOpen,
      { timeoutMs: 10_000 },
    );
    expect(gadget(seen, EXIT_BUTTON.id).on).toBe(true);
  });
});
