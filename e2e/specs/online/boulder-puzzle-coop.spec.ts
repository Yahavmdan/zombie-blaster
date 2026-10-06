import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eBoulderPuzzleView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const PUZZLE_FLOOR: number = 2;

function replayed(log: E2eVfxLogEntry[], type: string): boolean {
  return log.some(
    (e: E2eVfxLogEntry): boolean =>
      e.direction === 'replayed' && e.type === type && (e.particlesAdded ?? 0) > 0,
  );
}

test.describe('boulder puzzle in co-op', { tag: '@online' }, (): void => {
  test("a guest breaks the gate: the host's boulder breaks the wall, both screens see it, and the guest walks out", async ({
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
      'boulder',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.setFloor(PUZZLE_FLOOR);
    const g0: E2eSnapshot = await guest.probe.waitFor(
      'guest on the puzzle floor',
      (s: E2eSnapshot): boolean => s.floor === PUZZLE_FLOOR && s.puzzle !== null,
    );
    const h0: E2eSnapshot = await host.probe.state();
    expect(g0.puzzle!.ledge, 'same ledge (two players: higher than solo)').toEqual(
      h0.puzzle!.ledge,
    );
    expect(g0.puzzle!.gate, 'same gate').toEqual(h0.puzzle!.gate);
    expect(g0.puzzle!.wall, 'same wall').toEqual(h0.puzzle!.wall);
    const puzzle: E2eBoulderPuzzleView = g0.puzzle!;

    // Setup: put the guest on the ledge next to the gate (the climb is covered by the solo spec).
    await guest.probe.clearVfxLog();
    const besideGate: number =
      puzzle.wallDir === 1
        ? puzzle.gate.x - WORLD.playerWidth - 2
        : puzzle.gate.x + puzzle.gate.width + 2;
    await guest.probe.teleport(besideGate, puzzle.ledge.y - WORLD.playerHeight);
    await guest.wait(300);
    await guest.face(puzzle.wallDir === 1 ? 'right' : 'left');
    await guest.hold(KEYS.attack);
    await host.probe.waitFor(
      "the host counts the guest's hits and breaks the wall",
      (s: E2eSnapshot): boolean => s.puzzle?.wallBroken === true,
      { timeoutMs: 15_000 },
    );
    await guest.release(KEYS.attack);
    await guest.probe.waitFor(
      'the guest sees the wall gone and the boulder shattered',
      (s: E2eSnapshot): boolean => s.puzzle?.wallStanding === false && s.puzzle.boulder === null,
      { timeoutMs: 10_000 },
    );
    const log: E2eVfxLogEntry[] = await guest.probe.vfxLog();
    expect(replayed(log, 'gate-break'), 'the guest saw the gate splinter').toBe(true);
    expect(replayed(log, 'wall-break'), 'the guest saw the wall come down').toBe(true);

    const towardWall: string = puzzle.wallDir === 1 ? KEYS.right : KEYS.left;
    const nearWall: number =
      puzzle.wallDir === 1
        ? puzzle.wall.x - WORLD.playerWidth - 8
        : puzzle.wall.x + puzzle.wall.width + 8;
    await guest.probe.teleport(nearWall, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(250);
    await guest.hold(towardWall);
    await host.probe.waitFor(
      'the guest walking out ends the floor',
      (s: E2eSnapshot): boolean => s.floor === PUZZLE_FLOOR + 1,
      { timeoutMs: 15_000 },
    );
    await guest.probe.waitFor(
      'the guest reaches floor 3',
      (s: E2eSnapshot): boolean => s.floor === PUZZLE_FLOOR + 1,
      { timeoutMs: 10_000 },
    );
    await guest.release(towardWall);
  });
});
