import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2ePlateView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const PLATE_FLOOR: number = 5;

function replayed(log: E2eVfxLogEntry[], type: string): boolean {
  return log.some(
    (e: E2eVfxLogEntry): boolean =>
      e.direction === 'replayed' && e.type === type && (e.particlesAdded ?? 0) > 0,
  );
}

test.describe('pressure plate in co-op', { tag: '@online' }, (): void => {
  test('a guest holds the plate down: the host opens the door, the guest sees it, and the host walks everyone out', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'plate',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.setFloor(PLATE_FLOOR);
    const g0: E2eSnapshot = await guest.probe.waitFor(
      'guest on the plate floor',
      (s: E2eSnapshot): boolean => s.floor === PLATE_FLOOR && s.plate !== null,
    );
    const h0: E2eSnapshot = await host.probe.state();
    const plate: E2ePlateView = g0.plate!;
    expect(plate.box, 'same plate').toEqual(h0.plate!.box);
    expect(g0.exit, 'same exit').toEqual(h0.exit);

    // The guest steps onto the plate: the host weighs it and opens the door.
    await guest.probe.clearVfxLog();
    await guest.probe.teleport(
      plate.box.x + plate.box.width / 2 - WORLD.playerWidth / 2,
      plate.box.y - WORLD.playerHeight - 10,
    );
    const hOpen: E2eSnapshot = await host.probe.waitFor(
      'the host weighs the guest and opens the door',
      (s: E2eSnapshot): boolean => s.plate!.doorOpen,
      { timeoutMs: 8_000 },
    );
    expect(hOpen.plate!.weight).toBe(plate.playerWeight);
    await guest.probe.waitFor(
      'the guest sees the door open',
      (s: E2eSnapshot): boolean => s.plate!.doorOpen,
      { timeoutMs: 5_000 },
    );
    expect(replayed(await guest.probe.vfxLog(), 'door-open'), 'the guest saw it open').toBe(true);

    // The guest steps off: the door slams shut for both.
    await guest.probe.clearVfxLog();
    await guest.face('right');
    await guest.probe.teleport(plate.box.x - WORLD.playerWidth, plate.box.y - WORLD.playerHeight);
    await host.probe.waitFor(
      'the host shuts the door',
      (s: E2eSnapshot): boolean => s.plate!.doorTicks === 0,
      { timeoutMs: 8_000 },
    );
    await guest.probe.waitFor(
      'the guest sees it shut',
      (s: E2eSnapshot): boolean => s.plate!.doorTicks === 0 && !s.plate!.held,
      { timeoutMs: 5_000 },
    );
    expect(replayed(await guest.probe.vfxLog(), 'door-shut'), 'the guest saw it shut').toBe(true);

    // The host waits on the exit (shut: nothing happens), then the guest holds the plate again.
    const exit: { x: number; y: number; width: number } = h0.exit;
    await host.probe.teleport(exit.x + 40, exit.y - WORLD.playerHeight - 10);
    await host.wait(1_500);
    expect((await host.probe.state()).floor, 'the shut door keeps the host in').toBe(PLATE_FLOOR);
    await guest.probe.teleport(
      plate.box.x + plate.box.width / 2 - WORLD.playerWidth / 2,
      plate.box.y - WORLD.playerHeight - 10,
    );
    await guest.probe.waitFor(
      'both move on to floor 6',
      (s: E2eSnapshot): boolean => s.floor === PLATE_FLOOR + 1,
      { timeoutMs: 10_000 },
    );
    expect((await host.probe.state()).floor).toBe(PLATE_FLOOR + 1);
  });
});
