import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer } from '../../support/game-player';
import { RoomSession } from '../../support/room';
import { E2eSnapshot, E2eVfxLogEntry } from '../../support/probe';
import { lastSeq } from '../../support/vfx-gate';

/**
 * The host simulates spitters. Its `spit-spray` (bile out of the mouth) and `spit-splat` (the glob
 * bursting, with the puddle it leaves) are replayed on every guest's screen, so all players see
 * the same spit land in the same place.
 */

/** Mirrors GROUND_Y and PLAYER_HEIGHT in shared/game-constants.ts. */
const GROUND_Y: number = 620;
const PLAYER_HEIGHT: number = 48;

test.describe('spitter spit sync', { tag: ['@online', '@visual'] }, (): void => {
  let session: RoomSession;
  let host: GamePlayer;
  let guest: GamePlayer;

  test.beforeEach(async ({ room }: { room: RoomFactory }): Promise<void> => {
    session = await room(
      [
        { name: 'Host', classId: 'warrior' },
        { name: 'Guest', classId: 'assassin' },
      ],
      'spitter-coop',
    );
    host = session.host;
    guest = session.guests[0];
  });

  test('a guest sees the host spitter spray, splat and leave the same puddle', async ({}: object, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(120_000);
    // The host's god mode skips every hit, so the globs aimed at the guest land on the ground.
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await host.probe.clearZombies();
    await host.probe.teleport(100, GROUND_Y - PLAYER_HEIGHT);
    await guest.probe.teleport(700, GROUND_Y - PLAYER_HEIGHT);
    const guestMark: number = lastSeq(await guest.probe.vfxLog());

    await host.probe.spawnZombieAt(920, 'spitter');
    const seen: E2eSnapshot = await guest.probe.waitFor(
      'the guest draws the puddle',
      (s: E2eSnapshot): boolean => s.acidPuddles.length > 0,
      { timeoutMs: 30_000, intervalMs: 50 },
    );
    await guest.attachCanvas(testInfo, 'guest sees the spit puddle');

    const replayed: E2eVfxLogEntry[] = (await guest.probe.vfxLog()).filter(
      (e: E2eVfxLogEntry): boolean => e.seq > guestMark && e.direction === 'replayed',
    );
    const spray: E2eVfxLogEntry | undefined = replayed.find(
      (e: E2eVfxLogEntry): boolean => e.type === 'spit-spray',
    );
    const splat: E2eVfxLogEntry | undefined = replayed.find(
      (e: E2eVfxLogEntry): boolean => e.type === 'spit-splat',
    );
    expect(spray?.particlesAdded ?? 0, 'the guest replayed the spray as droplets').toBeGreaterThan(
      0,
    );
    expect(splat?.particlesAdded ?? 0, 'the guest replayed the splat as droplets').toBeGreaterThan(
      0,
    );

    const hostPuddles: E2eSnapshot['acidPuddles'] = (await host.probe.state()).acidPuddles;
    expect(hostPuddles, 'the host has the same puddle').toEqual(
      expect.arrayContaining([seen.acidPuddles[0]]),
    );
  });
});
