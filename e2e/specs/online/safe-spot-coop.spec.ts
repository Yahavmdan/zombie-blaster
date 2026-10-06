import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot } from '../../support/probe';
import { WORLD } from '../../support/invariants';

test.describe('safe spot in co-op', { tag: '@online' }, (): void => {
  test("a guest resting on the safe spot is out of the host's zombies' reach, and both screens agree", async ({
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
      'safespot',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await host.probe.setGodMode(true);
    await host.probe.setFloor(3);
    const g0: E2eSnapshot = await guest.probe.waitFor(
      'guest on floor 3',
      (s: E2eSnapshot): boolean => s.floor === 3 && s.level.safeSpot !== null,
    );
    const h0: E2eSnapshot = await host.probe.state();
    expect(g0.level.safeSpot, 'both players have the same safe spot').toEqual(h0.level.safeSpot);
    const spot: NonNullable<E2eSnapshot['level']['safeSpot']> = g0.level.safeSpot!;
    // Setup: put the guest up there (climbing the ladder is covered by the solo spec).
    await guest.probe.teleport(
      spot.x + spot.width / 2 - WORLD.playerWidth / 2,
      spot.y - WORLD.playerHeight,
    );
    const rested: E2eSnapshot = await guest.probe.waitFor(
      'guest resting',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && s.restingPlayerIds.includes(s.player!.id),
    );
    const guestId: string = rested.player!.id;
    await host.probe.waitFor(
      'the host sees the guest resting',
      (s: E2eSnapshot): boolean => s.restingPlayerIds.includes(guestId),
      { timeoutMs: 10_000 },
    );
    const hp0: number = rested.player!.hp;
    const end: number = Date.now() + 12_000;
    let zombiesOnHost: number = 0;
    while (Date.now() < end) {
      const [g, h]: E2eSnapshot[] = await Promise.all([guest.probe.state(), host.probe.state()]);
      expect(g.player!.hp, 'the resting guest takes no damage').toBeGreaterThanOrEqual(hp0);
      zombiesOnHost = Math.max(
        zombiesOnHost,
        h.zombies.filter((z: { isDead: boolean }): boolean => !z.isDead).length,
      );
      await guest.wait(250);
    }
    expect(zombiesOnHost, 'the host simulated zombies the whole time').toBeGreaterThan(0);
  });
});
