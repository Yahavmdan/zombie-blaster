import { test, expect, RoomFactory } from '../../support/fixtures';
import { RoomSession } from '../../support/room';
import { GamePlayer } from '../../support/game-player';
import { E2eSkillView, E2eSnapshot, E2eZombieView } from '../../support/probe';
import { WORLD } from '../../support/invariants';

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
    await host.probe.setGodMode(true);
    await guest.probe.setGodMode(true);
    await guest.probe.maxOutPlayer();
    const magnet: E2eSkillView | undefined = (await guest.probe.state()).usableSkills.find(
      (k: E2eSkillView): boolean => k.id === 'warrior-monster-magnet',
    );
    expect(magnet, 'monster magnet is usable').toBeDefined();

    await host.probe.waitFor(
      'zombies on the field',
      (s: E2eSnapshot): boolean =>
        s.zombies.filter((z: E2eZombieView): boolean => !z.isDead && z.spawnTimer <= 0).length >= 2,
      { timeoutMs: 40_000 },
    );
    await guest.castSkill(magnet!.slot);

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
