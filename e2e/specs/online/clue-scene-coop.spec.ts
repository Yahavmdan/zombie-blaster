import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eGadgetView, E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

type ZombieView = E2eSnapshot['zombies'][number];

/** Floor 1 (DESIGNED_LEVELS[1]): the exit door g1 and its button g2. */
const DOOR_ID: string = 'g1';
const BUTTON: { id: string; x: number; width: number } = { id: 'g2', x: 376, width: 48 };
/** Mirrors GADGET_DOOR_TICKS in shared/game-constants.ts. */
const DOOR_TICKS: number = 30;

function gadget(s: E2eSnapshot, id: string): E2eGadgetView {
  const g: E2eGadgetView | undefined = s.gadgets.find((x: E2eGadgetView): boolean => x.id === id);
  if (!g) throw new Error(`no gadget ${id}`);
  return g;
}

test.describe('floor 1 clue scene in co-op', { tag: '@online' }, (): void => {
  test('the host runs the clue zombie; the guest sees it on the button and the door open', async ({
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
      'clue',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.teleport(900, WORLD.groundY - WORLD.playerHeight);
    await guest.probe.teleport(950, WORLD.groundY - WORLD.playerHeight);

    const holding: E2eSnapshot = await host.probe.waitFor(
      'the host walks the clue zombie onto the button',
      (s: E2eSnapshot): boolean => s.clueScene.phase === 'holding',
      { timeoutMs: 30_000 },
    );
    const id: string = holding.clueScene.zombieId!;

    await guest.probe.waitFor(
      'the guest sees the same zombie on the button and the door fully open',
      (s: E2eSnapshot): boolean => {
        const z: ZombieView | undefined = s.zombies.find((zz: ZombieView): boolean => zz.id === id);
        if (!z) return false;
        const mid: number = z.x + z.width / 2;
        return (
          mid >= BUTTON.x &&
          mid <= BUTTON.x + BUTTON.width &&
          gadget(s, DOOR_ID).openTicks >= DOOR_TICKS
        );
      },
      { timeoutMs: 10_000 },
    );
    expect((await guest.probe.state()).clueScene.phase, 'a guest never runs the scene').toBe(
      'done',
    );
  });
});
