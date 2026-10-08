import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer, KEYS } from '../../support/game-player';
import { E2eSpringView, E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { WORLD } from '../../support/invariants';

const SPRING_FLOOR: number = 3;

test.describe('spring puzzle in co-op', { tag: '@online' }, (): void => {
  test('a guest pulls the charged lever and hops on: the host counts down, the guest flies up to the exit and sees the launch', async ({
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
      'spring',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.setFloor(SPRING_FLOOR);
    const g0: E2eSnapshot = await guest.probe.waitFor(
      'guest on the spring floor',
      (s: E2eSnapshot): boolean => s.floor === SPRING_FLOOR && s.spring !== null,
    );
    const h0: E2eSnapshot = await host.probe.state();
    expect(g0.spring!.spring, 'same spring').toEqual(h0.spring!.spring);
    expect(g0.exit, 'same exit, at the top with two players too').toEqual(h0.exit);
    const spring: E2eSpringView = g0.spring!;

    // Setup: the host's simulation gets the charge (killing for it is covered by the pile specs).
    const xs: number[] = [0.25, 0.5, 0.75].map(
      (f: number): number => spring.spring.x + spring.spring.width * f,
    );
    for (let batch: number = 0; batch < 6; batch++) {
      const s: E2eSnapshot = await guest.probe.state();
      if (s.spring!.charge >= spring.chargeNeeded) break;
      for (const x of xs) await host.probe.dropCorpses(x, 4);
      await guest.wait(3_000);
    }
    await guest.probe.waitFor(
      'the guest sees the full charge (synced corpses)',
      (s: E2eSnapshot): boolean => s.spring!.charge >= spring.chargeNeeded,
      { timeoutMs: 10_000 },
    );

    const x: number =
      spring.side === 1
        ? spring.lever.x - WORLD.playerWidth - 4
        : spring.lever.x + spring.lever.width + 4;
    await guest.probe.clearVfxLog();
    // Face first: the turning key-press walks a step.
    await guest.face(spring.side === 1 ? 'right' : 'left');
    await guest.probe.teleport(x, WORLD.groundY - WORLD.playerHeight);
    await guest.wait(300);
    await guest.hold(KEYS.attack);
    await host.probe.waitFor(
      "the host counts the guest's lever pull and counts down",
      (s: E2eSnapshot): boolean => s.spring!.countdownTicks > 0,
      { timeoutMs: 10_000 },
    );
    await guest.release(KEYS.attack);
    await guest.probe.waitFor(
      'the guest sees the countdown',
      (s: E2eSnapshot): boolean => s.spring!.countdownTicks > 0,
      { timeoutMs: 5_000 },
    );
    await guest.probe.teleport(
      spring.spring.x + spring.spring.width / 2 - WORLD.playerWidth / 2,
      spring.spring.y - 200,
    );
    await guest.probe.waitFor(
      'the guest flies up off the spring',
      (s: E2eSnapshot): boolean => s.spring!.launches === 1 && s.player!.y < 300,
      { timeoutMs: 8_000 },
    );
    const log: E2eVfxLogEntry[] = await guest.probe.vfxLog();
    expect(
      log.some(
        (e: E2eVfxLogEntry): boolean =>
          e.direction === 'replayed' && e.type === 'spring-launch' && (e.particlesAdded ?? 0) > 0,
      ),
      'the guest saw the launch',
    ).toBe(true);
    await host.probe.waitFor(
      'the guest landing on the exit ends the floor',
      (s: E2eSnapshot): boolean => s.floor === SPRING_FLOOR + 1,
      { timeoutMs: 15_000 },
    );
  });
});
