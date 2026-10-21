import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { TOUGH_FLOOR, warriorArena, zombieAt, zombieById } from '../../support/warrior';
import { KNOCK_MAX_TILT, KNOCK_TILT_SLACK, knockIt, peakTilt } from '../../support/zombie-knock';

test.describe('knocked zombies in co-op', { tag: '@online' }, (): void => {
  test("the guest sees the host's knocked zombie tilt and stand back up", async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'zombie-knock',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await guest.probe.setGodMode(true);
    const x: number = await warriorArena(host, [], true, TOUGH_FLOOR);
    await guest.probe.waitFor(
      'the guest is on the tough floor',
      (s: E2eSnapshot): boolean => s.floor === TOUGH_FLOOR,
      { timeoutMs: 10_000 },
    );
    // Floor 30 is crowded and a swing knocks the nearest zombie: this one alone.
    await host.probe.clearZombies();
    const id: string = await zombieAt(host, x + 70);
    await guest.probe.waitFor(
      'the guest sees the zombie',
      (s: E2eSnapshot): boolean => !!zombieById(s, id),
      { timeoutMs: 5_000 },
    );

    await knockIt(host, id);
    const seen: number = await peakTilt(guest, id);
    await guest.attachCanvas(testInfo, 'guest: zombie back on its feet');
    expect(seen, 'the guest drew it tilted').toBeGreaterThan(0.03);
    expect(seen).toBeLessThan(KNOCK_MAX_TILT + KNOCK_TILT_SLACK);
    expect(zombieById(await host.probe.state(), id)!.angle, 'upright on the host too').toBe(0);
  });
});
