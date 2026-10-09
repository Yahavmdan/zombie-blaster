import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import {
  E2eRemotePlayerView,
  E2eSnapshot,
  E2eVfxLogEntry,
  E2eZombieView,
} from '../../support/probe';
import { lastSeq } from '../../support/vfx-gate';

/**
 * A hit tints the player's sprite red (poison: pulsing green), drawn in the sprite's own
 * shape. The victim queues `player-hurt`; every other screen replays it as the same tint.
 */
test.describe('player status tint', { tag: ['@online', '@visual'] }, (): void => {
  let session: RoomSession;
  let host: GamePlayer;
  let guest: GamePlayer;

  test.beforeEach(async ({ room }: { room: RoomFactory }): Promise<void> => {
    session = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'status-tint',
    );
    host = session.host;
    guest = session.guests[0];
  });

  test('a hit guest flashes red on its own screen and on the host', async ({}: object, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(false);
    const guestId: string = (await guest.probe.state()).player!.id;
    await host.probe.waitFor(
      'zombies spawned',
      (s: E2eSnapshot): boolean => s.zombies.some((z: E2eZombieView): boolean => z.spawnTimer <= 0),
      { timeoutMs: 20_000 },
    );
    const guestMark: number = lastSeq(await guest.probe.vfxLog());
    const hostMark: number = lastSeq(await host.probe.vfxLog());

    const startHp: number = (await guest.probe.state()).player!.hp;
    const deadline: number = Date.now() + 60_000;
    let hostSawTint: boolean = false;
    while (!hostSawTint && Date.now() < deadline) {
      const h: E2eSnapshot = await host.probe.state();
      const z: E2eZombieView | undefined = h.zombies.find(
        (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0,
      );
      if (z) await guest.probe.teleport(z.x, z.y + z.height - 48);
      hostSawTint = await host.probe
        .waitFor(
          'host draws the guest tinted red',
          (s: E2eSnapshot): boolean =>
            (s.remotePlayers.find((r: E2eRemotePlayerView): boolean => r.id === guestId)?.tint
              .hurtTicks ?? 0) > 0,
          { timeoutMs: 1_500, intervalMs: 25 },
        )
        .then((): boolean => true)
        .catch((): boolean => false);
    }
    await host.attachCanvas(testInfo, 'host sees the hit guest tinted');

    expect((await guest.probe.state()).player!.hp, 'guest took a hit').toBeLessThan(startHp);
    expect(hostSawTint, 'host drew the guest with a hurt tint').toBe(true);

    const queued: E2eVfxLogEntry[] = (await guest.probe.vfxLog()).filter(
      (e: E2eVfxLogEntry): boolean =>
        e.seq > guestMark && e.direction !== 'replayed' && e.type === 'player-hurt',
    );
    expect(queued.length, 'guest queued player-hurt for the others').toBeGreaterThan(0);
    const replayed: E2eVfxLogEntry[] = (await host.probe.vfxLog()).filter(
      (e: E2eVfxLogEntry): boolean =>
        e.seq > hostMark &&
        e.direction === 'replayed' &&
        e.type === 'player-hurt' &&
        e.playerId === guestId,
    );
    expect(replayed.length, 'host replayed the guest player-hurt').toBeGreaterThan(0);
  });
});
