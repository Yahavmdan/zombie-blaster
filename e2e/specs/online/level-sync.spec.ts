import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { drawnGeometry, expectArtMatchesCollision } from '../../support/level-geometry';

function layoutOf(s: E2eSnapshot): string {
  return JSON.stringify({ seed: s.level.seed, level: s.level, exit: s.exit });
}

/**
 * Floors are generated from the host's seed. Every player must build the identical level, and
 * on every screen the drawn art must sit exactly on that level's collision geometry.
 */
test.describe('generated levels in co-op', { tag: ['@online', '@visual'] }, (): void => {
  test('host and guest build the same floor and both draw it where it collides', async ({
    room,
  }: {
    room: RoomFactory;
  }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'levels',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);

    for (const floor of [1, 2, 3]) {
      if (floor > 1) await host.probe.setFloor(floor);
      const h: E2eSnapshot = await host.probe.waitFor(
        `host on floor ${floor}`,
        (s: E2eSnapshot): boolean => s.floor === floor && s.remotePlayers.length === 1,
      );
      const g: E2eSnapshot = await guest.probe.waitFor(
        `guest follows to floor ${floor} with the host's layout`,
        (s: E2eSnapshot): boolean => s.floor === floor && layoutOf(s) === layoutOf(h),
        { timeoutMs: 10_000 },
      );
      expect(layoutOf(g), `floor ${floor}: identical level on both screens`).toBe(layoutOf(h));
      expectArtMatchesCollision(
        await drawnGeometry(host, `host floor ${floor}`),
        `host floor ${floor}`,
      );
      expectArtMatchesCollision(
        await drawnGeometry(guest, `guest floor ${floor}`),
        `guest floor ${floor}`,
      );
      await host.attachCanvas(testInfo, `host floor ${floor}`);
      await guest.attachCanvas(testInfo, `guest floor ${floor}`);
    }
  });
});
