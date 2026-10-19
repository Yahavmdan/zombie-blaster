import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';
import { WARRIOR, castSkill, warriorArena, zombieAt } from '../../support/warrior';

/**
 * A guest's monster magnet: the host simulates the drag (zombies are host-owned) and every
 * screen sees the same zombie fly in over time, ending next to the guest.
 */
test.describe('monster magnet in co-op', { tag: '@online' }, (): void => {
  test("a guest's magnet drags zombies on the host, and both screens see the drag", async ({
    room,
  }: {
    room: RoomFactory;
  }): Promise<void> => {
    test.setTimeout(120_000);
    const session: RoomSession = await room(
      [
        { name: 'Host', classId: 'assassin' },
        { name: 'Guest', classId: 'warrior' },
      ],
      'magnet',
    );
    const host: GamePlayer = session.host;
    const guest: GamePlayer = session.guests[0];
    await guest.probe.setGodMode(true);
    await guest.probe.maxOutPlayer();
    await guest.probe.setTreeSkills([WARRIOR.monsterMagnet]);
    // The host finds open ground (it owns the layout); the guest stands there too (no ladder overhead).
    const x: number = await warriorArena(host, []);
    await guest.probe.teleport(x, WORLD.groundY - WORLD.playerHeight);
    await guest.probe.waitFor(
      'the guest stands on the open ground',
      (s: E2eSnapshot): boolean =>
        s.player!.isGrounded && Math.abs(s.player!.x - x) < 20 && Math.abs(s.player!.y + WORLD.playerHeight - WORLD.groundY) < 2,
      { timeoutMs: 5_000 },
    );
    await guest.face('right');
    const far: string = await zombieAt(host, x + 260);
    await guest.probe.waitFor(
      'the guest sees the far zombie',
      (s: E2eSnapshot): boolean => s.zombies.some((z: E2eZombieView): boolean => z.id === far),
      { timeoutMs: 3_000 },
    );

    // The magnet's skill-bar key.
    await castSkill(guest, WARRIOR.monsterMagnet);

    const pulledOnHost: E2eSnapshot = await host.probe.waitFor(
      'the host simulates a drag',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => z.magnetPull !== null),
      { timeoutMs: 3_000, intervalMs: 20 },
    );
    const dragged: E2eZombieView = pulledOnHost.zombies.find(
      (z: E2eZombieView): boolean => z.magnetPull !== null,
    )!;
    await guest.probe.waitFor(
      'the guest sees the same zombie being dragged',
      (s: E2eSnapshot): boolean =>
        s.zombies.some((z: E2eZombieView): boolean => z.id === dragged.id && z.magnetPull !== null),
      { timeoutMs: 3_000, intervalMs: 20 },
    );
    const landed: E2eSnapshot = await guest.probe.waitFor(
      'the dragged zombie lands next to the guest',
      (s: E2eSnapshot): boolean => {
        const z: E2eZombieView | undefined = s.zombies.find(
          (zz: E2eZombieView): boolean => zz.id === dragged.id,
        );
        if (!z || z.isDead || !s.player) return true;
        const gap: number = Math.abs(z.x + z.width / 2 - (s.player.x + WORLD.playerWidth / 2));
        return z.magnetPull === null && gap < 110;
      },
      { timeoutMs: 4_000 },
    );
    expect(landed.player, 'guest still in the game').not.toBeNull();
  });
});
