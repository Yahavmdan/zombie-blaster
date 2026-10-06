import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { Brain } from '../../support/brain';
import { E2eSnapshot } from '../../support/probe';

/** Mirrors EXIT_PLATFORM_Y (floor 1, solo) and EXIT_RISE_PER_EXTRA_PLAYER in shared/game-constants.ts. */
const SOLO_FLOOR1_EXIT_Y: number = 310;
const EXIT_RISE_PER_EXTRA_PLAYER: number = 64;

test.describe('exit pile in co-op', { tag: '@online' }, (): void => {
  test('with two players the exit hangs higher (a taller pile), and both screens agree', async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'exitcoop',
    );
    const [h, g]: E2eSnapshot[] = await Promise.all([
      session.host.probe.waitFor(
        'host sees the guest',
        (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      ),
      session.guests[0].probe.waitFor(
        'guest sees the host',
        (s: E2eSnapshot): boolean => s.remotePlayers.length === 1,
      ),
    ]);
    expect(h.exit.y, 'one extra player raises the exit').toBe(
      SOLO_FLOOR1_EXIT_Y - EXIT_RISE_PER_EXTRA_PLAYER,
    );
    expect(g.exit.y, 'the guest sees the exit at the same height').toBe(h.exit.y);
    expect(g.exitPile.reachY, 'both screens need the same pile').toBe(h.exitPile.reachY);
  });

  test("a guest's kills under the exit pile up there, and both screens show the same pile", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'exitguest',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    // The host idles far from the exit; only the guest fights.
    const s0: E2eSnapshot = await host.probe.state();
    await host.probe.teleport(s0.exitPile.centerX < 640 ? 1100 : 140, 400);
    const brain: Brain = new Brain(guest, {
      deadline: Date.now() + 120_000,
      goal: 'exit',
      stopWhen: (s: E2eSnapshot): boolean => s.exitPile.bodies >= 3,
    });
    await brain.run();
    const h: E2eSnapshot = await host.probe.waitFor(
      'host has the bodies under the exit',
      (s: E2eSnapshot): boolean => s.exitPile.bodies >= 3,
      { timeoutMs: 10_000 },
    );
    const g: E2eSnapshot = await guest.probe.waitFor(
      'guest shows the same pile',
      (s: E2eSnapshot): boolean => s.exitPile.bodies === h.exitPile.bodies || s.exitPile.bodies >= 3,
      { timeoutMs: 10_000 },
    );
    expect(Math.abs(g.exitPile.topY - h.exitPile.topY), 'same pile height on both screens').toBeLessThanOrEqual(
      10,
    );
  });
});
