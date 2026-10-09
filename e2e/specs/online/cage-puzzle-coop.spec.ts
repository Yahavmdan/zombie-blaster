import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eCageView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const CAGE_FLOOR: number = 4;

/** Puts a player on the surface left of a cleat, facing it, and starts swinging. */
async function swingAt(p: GamePlayer, cage: E2eCageView): Promise<void> {
  // Face first: the turning key-press walks a step.
  await p.face('right');
  await p.probe.teleport(
    cage.cleat.x - WORLD.playerWidth - 4,
    cage.cleat.y + cage.cleat.height - WORLD.playerHeight,
  );
  await p.wait(300);
  await p.hold(KEYS.attack);
}

function replayed(log: E2eVfxLogEntry[], type: string): boolean {
  return log.some(
    (e: E2eVfxLogEntry): boolean =>
      e.direction === 'replayed' && e.type === type && (e.particlesAdded ?? 0) > 0,
  );
}

test.describe('hanging cages in co-op', { tag: '@online' }, (): void => {
  test('a guest cuts two chains: the host drops the cages, the guest sees them land and rides the exit cage up', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'cage',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.setFloor(CAGE_FLOOR);
    const g0: E2eSnapshot = await guest.probe.waitFor(
      'guest on the cage floor',
      (s: E2eSnapshot): boolean => s.floor === CAGE_FLOOR && s.cages !== null,
    );
    const h0: E2eSnapshot = await host.probe.state();
    expect(g0.cages, 'same cages, contents, cleats and chains').toEqual(h0.cages);
    expect(g0.exit, 'same exit').toEqual(h0.exit);

    // A mid-screen zombie cage first: the host lets the zombies loose, the guest sees the smash.
    const z: number = g0.cages!.cages.findIndex(
      (c: E2eCageView, i: number): boolean => i > 0 && c.content === 'zombies',
    );
    await guest.probe.clearVfxLog();
    await swingAt(guest, g0.cages!.cages[z]);
    await host.probe.waitFor(
      "the host counts the guest's swings and smashes the zombie cage",
      (s: E2eSnapshot): boolean => s.cages!.cages[z].landed,
      { timeoutMs: 10_000 },
    );
    await guest.release(KEYS.attack);
    const gSmash: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the zombie cage gone',
      (s: E2eSnapshot): boolean => s.cages!.cages[z].landed && s.cages!.cages[z].box === null,
      { timeoutMs: 5_000 },
    );
    expect(gSmash.cages!.cages[0].cut, 'the exit cage still hangs').toBe(false);
    await guest.wait(500);
    expect(replayed(await guest.probe.vfxLog(), 'cage-smash'), 'the guest saw the smash').toBe(
      true,
    );
    expect(gSmash.zombies.length, 'the guest sees the zombies let loose').toBeGreaterThanOrEqual(
      g0.zombies.length + 1,
    );

    // Then the exit cage, with the host waiting under the exit: both end up standing on it.
    const exitCage: E2eCageView = g0.cages!.cages[0];
    const underX: number = exitCage.box!.x + exitCage.box!.width / 2 - WORLD.playerWidth / 2;
    await host.probe.teleport(underX, WORLD.groundY - WORLD.playerHeight);
    await guest.probe.clearVfxLog();
    await swingAt(guest, exitCage);
    const hDown: E2eSnapshot = await host.probe.waitFor(
      'the host drops the exit cage',
      (s: E2eSnapshot): boolean => s.cages!.cages[0].landed,
      { timeoutMs: 10_000 },
    );
    await guest.release(KEYS.attack);
    const top: number = hDown.cages!.cages[0].box!.y;
    expect(hDown.player!.y + WORLD.playerHeight, 'the host rode up onto the cage').toBe(top);
    const gDown: E2eSnapshot = await guest.probe.waitFor(
      'the guest sees the exit cage standing under the exit',
      (s: E2eSnapshot): boolean => s.cages!.cages[0].landed && s.cages!.cages[0].solid !== null,
      { timeoutMs: 5_000 },
    );
    expect(gDown.cages!.cages[0].solid).toEqual(hDown.cages!.cages[0].solid);
    expect(replayed(await guest.probe.vfxLog(), 'cage-land'), 'the guest saw it land').toBe(true);

    // The guest stands on the landed cage too (its own physics collides with it).
    await guest.probe.teleport(underX, top - WORLD.playerHeight - 40);
    // Let the drop play out (a teleport can report grounded for a tick before falling).
    await guest.wait(500);
    const onTop: E2eSnapshot = await guest.probe.waitFor(
      'the guest lands on the cage',
      (s: E2eSnapshot): boolean => s.player!.isGrounded && s.player!.velocityY === 0,
      { timeoutMs: 3_000 },
    );
    expect(onTop.player!.y + WORLD.playerHeight).toBe(top);
  });
});
