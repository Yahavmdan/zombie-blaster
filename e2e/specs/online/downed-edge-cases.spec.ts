import { TestInfo } from '@playwright/test';
import { test, expect, RoomFactory } from '../../support/fixtures';
import { GamePlayer, KEYS } from '../../support/game-player';
import { WORLD } from '../../support/invariants';
import { platformUnder } from '../../support/navigation';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';
import { RoomSession } from '../../support/room';

/**
 * A player downed online: where the body ends up.
 */

test.describe('downed players', { tag: '@online' }, (): void => {
  test('a player downed in mid-air falls to the ground', async ({
    room,
  }: { room: RoomFactory }, testInfo: TestInfo): Promise<void> => {
    test.setTimeout(150_000);
    const session: RoomSession = await room([
      { name: 'Host', classId: 'warrior' },
      { name: 'Jumper', classId: 'mage' },
    ]);
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(false);
    await host.probe.setFloor(6);

    // Hop among the zombies (held Space hops on every landing) until a hit downs the guest.
    await guest.hold(KEYS.jump);
    const deadline: number = Date.now() + 100_000;
    try {
      while (Date.now() < deadline && !(await guest.probe.state()).player!.isDown) {
        const h: E2eSnapshot = await host.probe.state();
        const z: E2eZombieView | undefined = h.zombies.find(
          (zz: E2eZombieView): boolean => !zz.isDead && zz.spawnTimer <= 0,
        );
        if (z) await guest.probe.teleport(z.x, z.y + z.height - 48);
        await guest.wait(600);
      }
    } finally {
      await guest.release(KEYS.jump);
    }
    expect((await guest.probe.state()).player!.isDown, 'guest went down').toBe(true);

    await guest.wait(1_500);
    const s: E2eSnapshot = await guest.probe.state();
    await guest.attachCanvas(testInfo, 'downed body');
    const feet: number = s.player!.y + WORLD.playerHeight;
    const surface: number = platformUnder(s, s.player!.x + WORLD.playerWidth / 2, feet).y;
    // Landed: on the platform, or on corpses lying on it (those are not in the level map).
    expect(
      { isGrounded: s.player!.isGrounded, velocityY: s.player!.velocityY },
      'the downed body rests on what is under it',
    ).toEqual({ isGrounded: true, velocityY: 0 });
    expect(Math.round(feet), `feet over the platform at ${surface}`).toBeLessThanOrEqual(surface);
  });
});
